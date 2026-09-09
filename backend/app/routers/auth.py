import secrets
import random
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db import query
from app.auth import verify_password, sign_token, hash_password, get_current_user, USER_WITH_DESIGNATION_SQL
from app.email_utils import send_email
from app.config import OTP_EXPIRY_MINUTES

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class LoginBody(BaseModel):
    email: str
    password: str


class ChangePasswordBody(BaseModel):
    currentPassword: str
    newPassword: str


class RegisterBody(BaseModel):
    full_name: str
    email: str
    password: str
    role: str  # 'user' | 'department_admin' | 'super_admin'
    department_id: Optional[int] = None  # required unless role == 'super_admin'
    designation_id: Optional[int] = None  # required when role == 'user'


class EmailBody(BaseModel):
    email: str


class VerifyEmailBody(BaseModel):
    email: str
    otp: str


class VerifyResetOtpBody(BaseModel):
    email: str
    otp: str


class ResetPasswordBody(BaseModel):
    email: str
    otp: str
    new_password: str


def _make_otp(user_id: int, purpose: str) -> str:
    """6-digit numeric code, single-use, short-lived. Invalidates any
    earlier unused code of the same purpose for this user first, so only
    the latest one ever works."""
    query("delete from otp_codes where user_id = %s and purpose = %s and used = false", [user_id, purpose])
    code = f"{random.randint(0, 999999):06d}"
    query(
        "insert into otp_codes (user_id, purpose, code, expires_at) values (%s,%s,%s, now() + (%s || ' minutes')::interval)",
        [user_id, purpose, code, OTP_EXPIRY_MINUTES],
    )
    return code


def _send_verification_email(user_id: int, email: str, full_name: str):
    code = _make_otp(user_id, "email_verification")
    send_email(
        email,
        "Verify your Ibotix PM email",
        f"Hi {full_name},\n\nYour verification code is: {code}\n\n"
        f"Enter this on the verification screen — it expires in {OTP_EXPIRY_MINUTES} minutes.\n\n— Ibotix PM",
    )


@router.post("/login")
def login(body: LoginBody):
    rows = query(
        "select id, full_name, email, password_hash, role, status, email_verified from users where lower(email) = lower(%s)",
        [body.email],
    )
    user = rows[0] if rows else None
    if not user:
        raise HTTPException(status_code=401, detail="No account found with that email.")
    if not user["email_verified"]:
        raise HTTPException(status_code=403, detail="Please verify your email before signing in — check your inbox for the code, or request a new one.")
    if user["status"] == "pending":
        raise HTTPException(status_code=403, detail="Your admin access request is still awaiting approval.")
    if user["status"] != "active":
        raise HTTPException(status_code=403, detail="Your account has been deactivated. Contact your admin.")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect password.")

    token = sign_token(user)
    return {"token": token}


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.post("/change-password")
def change_password(body: ChangePasswordBody, current_user: dict = Depends(get_current_user)):
    if len(body.newPassword) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters.")
    rows = query("select password_hash from users where id = %s", [current_user["id"]])
    if not verify_password(body.currentPassword, rows[0]["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect.")
    new_hash = hash_password(body.newPassword)
    query("update users set password_hash = %s where id = %s", [new_hash, current_user["id"]])
    return {"ok": True}


# ---------------------------------------------------------------------------
# Registration — every role available (including Super Admin, for future
# succession/expansion). A "user" account still needs email verification
# before it can sign in but no approval. "department_admin" and
# "super_admin" need BOTH email verification and approval from an
# existing active super admin (see /api/users/pending-admins).
# ---------------------------------------------------------------------------
@router.get("/register-options")
def register_options():
    """Public, unauthenticated — just enough to populate the registration
    form's dropdowns. No user data, only the master lists."""
    departments = query("select id, name from departments where is_active order by sort_order, name")
    designations = query("""
        select id, name, department_id from designations
         where is_active and department_id is not null
         order by name
    """)
    return {"departments": departments, "designations": designations}


@router.post("/register", status_code=201)
def register(body: RegisterBody):
    if body.role not in ("user", "department_admin", "super_admin"):
        raise HTTPException(status_code=400, detail="Role must be 'user', 'department_admin', or 'super_admin'.")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    exists = query("select 1 from users where lower(email) = lower(%s)", [body.email])
    if exists:
        raise HTTPException(status_code=409, detail="An account with that email already exists.")

    department_id = None
    designation_id = None

    if body.role != "super_admin":
        if not body.department_id:
            raise HTTPException(status_code=400, detail="Department is required.")
        dept = query("select id from departments where id = %s and is_active", [body.department_id])
        if not dept:
            raise HTTPException(status_code=404, detail="Department not found.")
        department_id = body.department_id

        if body.role == "user" and body.designation_id:
            desig = query("select id from designations where id = %s and department_id = %s",
                          [body.designation_id, body.department_id])
            if not desig:
                raise HTTPException(status_code=400, detail="That designation doesn't belong to the selected department.")
            designation_id = body.designation_id

    status = "pending" if body.role in ("department_admin", "super_admin") else "active"
    pw_hash = hash_password(body.password)
    rows = query(
        """insert into users (full_name, email, password_hash, designation_id, department_id, role, status, email_verified)
           values (%s,%s,%s,%s,%s,%s,%s,false) returning id""",
        [body.full_name, body.email, pw_hash, designation_id, department_id, body.role, status],
    )
    _send_verification_email(rows[0]["id"], body.email, body.full_name)

    if status == "pending":
        message = ("We've emailed you a verification code. Verify your email, then a super admin needs to "
                    "approve your admin access request before you can sign in.")
    else:
        message = "We've emailed you a verification code — verify your email, then you can sign in."
    return {"message": message, "pending": status == "pending"}


@router.post("/resend-verification")
def resend_verification(body: EmailBody):
    generic_response = {"message": "If that email needs verifying, a new code has been sent."}
    rows = query("select id, full_name, email_verified from users where lower(email) = lower(%s)", [body.email])
    if not rows or rows[0]["email_verified"]:
        return generic_response
    _send_verification_email(rows[0]["id"], body.email, rows[0]["full_name"])
    return generic_response


@router.post("/verify-email")
def verify_email(body: VerifyEmailBody):
    rows = query("select id from users where lower(email) = lower(%s)", [body.email])
    if not rows:
        raise HTTPException(status_code=404, detail="No account found with that email.")
    user_id = rows[0]["id"]

    otp = query(
        """select id from otp_codes where user_id = %s and purpose = 'email_verification'
             and code = %s and used = false and expires_at > now()""",
        [user_id, body.otp],
    )
    if not otp:
        raise HTTPException(status_code=400, detail="That code is invalid or has expired. Request a new one.")

    query("update users set email_verified = true where id = %s", [user_id])
    query("update otp_codes set used = true where id = %s", [otp[0]["id"]])
    return {"ok": True}


# ---------------------------------------------------------------------------
# Self-service password reset — OTP based. Two steps on purpose: verify
# the code first (so the person knows it's right before typing a new
# password), then submit the new password referencing that same code.
# ---------------------------------------------------------------------------
@router.post("/forgot-password")
def forgot_password(body: EmailBody):
    generic_response = {"message": "If that email is registered, a reset code has been sent."}

    rows = query("select id, full_name, status from users where lower(email) = lower(%s)", [body.email])
    if not rows or rows[0]["status"] != "active":
        return generic_response

    user = rows[0]
    code = _make_otp(user["id"], "password_reset")
    send_email(
        body.email,
        "Your Ibotix PM password reset code",
        f"Hi {user['full_name']},\n\nYour password reset code is: {code}\n\n"
        f"Enter this to reset your password — it expires in {OTP_EXPIRY_MINUTES} minutes.\n\n"
        f"If you didn't request this, you can ignore this email — your password won't change.\n\n— Ibotix PM",
    )
    return generic_response


@router.post("/verify-reset-otp")
def verify_reset_otp(body: VerifyResetOtpBody):
    rows = query("select id from users where lower(email) = lower(%s)", [body.email])
    if not rows:
        raise HTTPException(status_code=400, detail="Invalid or expired code.")
    user_id = rows[0]["id"]

    otp = query(
        """select id from otp_codes where user_id = %s and purpose = 'password_reset'
             and code = %s and used = false and expires_at > now()""",
        [user_id, body.otp],
    )
    if not otp:
        raise HTTPException(status_code=400, detail="Invalid or expired code. Request a new one.")

    query("update otp_codes set verified = true where id = %s", [otp[0]["id"]])
    return {"ok": True}


@router.post("/reset-password")
def reset_password_with_otp(body: ResetPasswordBody):
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    rows = query("select id from users where lower(email) = lower(%s)", [body.email])
    if not rows:
        raise HTTPException(status_code=400, detail="Invalid or expired code.")
    user_id = rows[0]["id"]

    otp = query(
        """select id from otp_codes where user_id = %s and purpose = 'password_reset'
             and code = %s and verified = true and used = false and expires_at > now()""",
        [user_id, body.otp],
    )
    if not otp:
        raise HTTPException(status_code=400, detail="This code hasn't been verified yet, or has expired. Start over.")

    pw_hash = hash_password(body.new_password)
    query("update users set password_hash = %s where id = %s", [pw_hash, user_id])
    query("update otp_codes set used = true where id = %s", [otp[0]["id"]])
    return {"ok": True}
