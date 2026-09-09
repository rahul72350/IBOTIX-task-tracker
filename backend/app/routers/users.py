from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from app.db import query
from app.auth import get_current_user, require_admin, scope_department, assert_department_access, hash_password

router = APIRouter(prefix="/api/users", tags=["Users"])

USER_SELECT = """
  select u.id, u.full_name, u.email, u.phone, u.role, u.status, u.department_id,
         u.designation_id, u.created_at,
         case when d.id is null then null
              else json_build_object('id', d.id, 'name', d.name, 'department', dp.name)
         end as designations,
         case when dept.id is null then null
              else json_build_object('id', dept.id, 'name', dept.name, 'is_hr_workflow', dept.is_hr_workflow)
         end as department,
         (select count(*)::int from assignments a where a.user_id = u.id) as "projectCount"
    from users u
    left join designations d  on d.id = u.designation_id
    left join departments   dp on dp.id = d.department_id
    left join departments   dept on dept.id = u.department_id
"""


class UserCreateBody(BaseModel):
    full_name: str
    email: str
    password: str
    phone: Optional[str] = None
    designation_id: Optional[int] = None
    department_id: Optional[int] = None
    role: Optional[str] = "user"


class UserUpdateBody(BaseModel):
    full_name: str
    phone: Optional[str] = None
    designation_id: Optional[int] = None
    department_id: Optional[int] = None
    role: Optional[str] = None


class StatusBody(BaseModel):
    status: str


class ResetPasswordBody(BaseModel):
    password: str


@router.get("")
def list_users(active: Optional[str] = Query(None), current_user: dict = Depends(get_current_user)):
    """Every role can list users (needed for assignment dropdowns etc.),
    but a department_admin only ever sees their own department's people,
    and a general user sees only their own department's people too —
    never another team's roster.

    Within a department's own view (i.e. anyone but a super_admin), the
    department_admin themselves is left out entirely — they manage the
    department, they aren't tracked staff in it: not assignable, not in
    Reports, not counted in any department-scoped headcount. Only a
    super_admin's unscoped view can still see admin accounts."""
    dept = scope_department(current_user)
    where = []
    if active == "1":
        where.append("u.status = 'active'")
    if dept is not None:
        where.append("u.department_id = %s")
        where.append("u.role != 'department_admin'")

    sql = USER_SELECT + (" where " + " and ".join(where) if where else "") + " order by u.full_name"
    params = [dept] if dept is not None else []
    return query(sql, params)


@router.post("", status_code=201)
def create_user(body: UserCreateBody, admin: dict = Depends(require_admin)):
    role = body.role if body.role in ("super_admin", "department_admin", "user") else "user"

    if admin["role"] == "super_admin":
        # Narrow, deliberate exception: a super admin can't manage users
        # day-to-day, but they're still the only one who *can* onboard a
        # brand-new department — so they may create that department's
        # very first admin, and nothing else.
        if role != "department_admin":
            raise HTTPException(status_code=403, detail="Super admin can only create a department's first admin — not general users or other super admins.")
        if not body.department_id:
            raise HTTPException(status_code=400, detail="Department is required.")
        existing_admin = query(
            "select 1 from users where department_id = %s and role = 'department_admin'",
            [body.department_id],
        )
        if existing_admin:
            raise HTTPException(status_code=409, detail="That department already has an admin.")

    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    exists = query("select 1 from users where lower(email) = lower(%s)", [body.email])
    if exists:
        raise HTTPException(status_code=409, detail="A user with that email already exists.")

    dept = scope_department(admin)

    # Only a super_admin may create admins of either tier. A department_admin
    # can only ever create general users, and only in their own department.
    if role in ("super_admin", "department_admin") and dept is not None:
        raise HTTPException(status_code=403, detail="Only a super admin can create admin accounts.")

    if role == "super_admin":
        department_id = None
    elif admin["role"] == "super_admin":
        department_id = body.department_id  # validated above
    elif dept is not None:
        department_id = dept  # department_admin creating a user: forced to their own department
    else:
        department_id = body.department_id
        if not department_id:
            raise HTTPException(status_code=400, detail="Department is required.")

    pw_hash = hash_password(body.password)
    rows = query(
        """insert into users (full_name, email, password_hash, phone, designation_id, department_id, role)
           values (%s,%s,%s,%s,%s,%s,%s) returning id""",
        [body.full_name, body.email, pw_hash, body.phone, body.designation_id, department_id, role],
    )
    created = query(USER_SELECT + " where u.id = %s", [rows[0]["id"]])
    return created[0]


@router.put("/{user_id}")
def update_user(user_id: int, body: UserUpdateBody, admin: dict = Depends(require_admin)):
    if admin["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin has view-only access to users.")
    target = query("select role, department_id from users where id = %s", [user_id])
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    dept = scope_department(admin)
    if dept is not None:
        if target[0]["department_id"] != dept:
            raise HTTPException(status_code=403, detail="That person isn't in your department.")
        if body.role and body.role != "user":
            raise HTTPException(status_code=403, detail="Only a super admin can change someone's admin tier.")

    rows = query(
        """update users set full_name = %s, phone = %s, designation_id = %s,
                            department_id = coalesce(%s, department_id),
                            role = coalesce(%s, role)
            where id = %s returning id""",
        [body.full_name, body.phone, body.designation_id, body.department_id, body.role, user_id],
    )
    if not rows:
        raise HTTPException(status_code=404, detail="User not found.")
    updated = query(USER_SELECT + " where u.id = %s", [user_id])
    return updated[0]


@router.patch("/{user_id}/status")
def set_user_status(user_id: int, body: StatusBody, admin: dict = Depends(require_admin)):
    if admin["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin has view-only access to users.")
    if body.status not in ("active", "inactive"):
        raise HTTPException(status_code=400, detail='Status must be "active" or "inactive".')
    if user_id == admin["id"] and body.status == "inactive":
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")

    target = query("select department_id from users where id = %s", [user_id])
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    assert_department_access(admin, target[0]["department_id"])

    query("update users set status = %s where id = %s", [body.status, user_id])
    return {"ok": True}


@router.post("/{user_id}/reset-password")
def reset_password(user_id: int, body: ResetPasswordBody, admin: dict = Depends(require_admin)):
    if admin["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin has view-only access to users.")
    if not body.password or len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    target = query("select department_id from users where id = %s", [user_id])
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    assert_department_access(admin, target[0]["department_id"])

    pw_hash = hash_password(body.password)
    query("update users set password_hash = %s where id = %s", [pw_hash, user_id])
    return {"ok": True}


# ---------------------------------------------------------------------------
# Approving/rejecting self-registered admin requests — department_admin
# AND super_admin (for succession/expansion). Separate from the "create a
# department's first admin" exception above, since these people already
# created their own account and just need sign-off.
# ---------------------------------------------------------------------------
@router.get("/pending-admins")
def list_pending_admins(admin: dict = Depends(require_admin)):
    if admin["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Only a super admin can review admin access requests.")
    return query("""
        select u.id, u.full_name, u.email, u.role, u.department_id, u.created_at,
               d.name as department_name,
               case when u.department_id is null then false else exists (
                 select 1 from users u2
                  where u2.department_id = u.department_id and u2.role = 'department_admin' and u2.status = 'active'
               ) end as department_already_has_admin
          from users u
          left join departments d on d.id = u.department_id
         where u.role in ('department_admin','super_admin') and u.status = 'pending'
         order by u.created_at
    """)


@router.post("/{user_id}/approve")
def approve_admin_request(user_id: int, admin: dict = Depends(require_admin)):
    if admin["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Only a super admin can approve admin access requests.")
    rows = query(
        "update users set status = 'active' where id = %s and role in ('department_admin','super_admin') and status = 'pending' returning id",
        [user_id],
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No pending admin request found with that id.")
    return {"ok": True}


@router.post("/{user_id}/reject")
def reject_admin_request(user_id: int, admin: dict = Depends(require_admin)):
    if admin["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Only a super admin can reject admin access requests.")
    rows = query(
        "delete from users where id = %s and role in ('department_admin','super_admin') and status = 'pending' returning id",
        [user_id],
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No pending admin request found with that id.")
    return {"ok": True}
