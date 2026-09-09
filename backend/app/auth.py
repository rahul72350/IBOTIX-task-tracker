from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from passlib.context import CryptContext

from app.config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS
from app.db import query

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def sign_token(user: dict) -> str:
    payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


USER_WITH_DESIGNATION_SQL = """
  select u.id, u.full_name, u.email, u.phone, u.role, u.status, u.department_id,
         u.designation_id, u.email_verified,
         case when d.id is null then null
              else json_build_object('name', d.name, 'department', dp.name)
         end as designations,
         case when dept.id is null then null
              else json_build_object('id', dept.id, 'name', dept.name, 'is_hr_workflow', dept.is_hr_workflow)
         end as department
    from users u
    left join designations d  on d.id = u.designation_id
    left join departments   dp on dp.id = d.department_id
    left join departments   dept on dept.id = u.department_id
   where u.id = %s
"""


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not signed in. Missing authorization token.")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError as err:
        if "expired" in str(err).lower():
            raise HTTPException(status_code=401, detail="Your session expired. Please sign in again.")
        raise HTTPException(status_code=401, detail="Invalid session token. Please sign in again.")

    user_id = payload.get("sub")
    rows = query(USER_WITH_DESIGNATION_SQL, [user_id])
    if not rows:
        raise HTTPException(status_code=401, detail="Your user account no longer exists.")
    user = rows[0]
    if user["status"] != "active":
        raise HTTPException(status_code=403, detail="Your account has been deactivated. Contact your admin.")
    return user


def require_super_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access is required for this action.")
    return current_user


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Either tier of admin. Handlers that use this MUST apply their own
    department-scoping (see scope_department) — this only checks the role,
    not which department the caller may touch."""
    if current_user.get("role") not in ("super_admin", "department_admin"):
        raise HTTPException(status_code=403, detail="Admin access is required for this action.")
    return current_user


def scope_department(current_user: dict):
    """Returns the department_id a department_admin is confined to, or
    None for a super_admin (meaning: no restriction). Use this in every
    admin-facing query that touches department-owned data."""
    if current_user["role"] == "super_admin":
        return None
    return current_user["department_id"]


def assert_department_access(current_user: dict, department_id: int):
    """Raises 403 if a department_admin is trying to touch a department
    that isn't their own. No-op for super_admin."""
    dept = scope_department(current_user)
    if dept is not None and dept != department_id:
        raise HTTPException(status_code=403, detail="That belongs to a different department.")
