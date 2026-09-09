from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db import query
from app.auth import get_current_user, require_super_admin

router = APIRouter(prefix="/api/admin-tasks", tags=["Admin Tasks"])

# A super admin's own lightweight directive to a department admin — a
# title and who it's for, nothing else. Starts In Progress the moment
# it's created; the only move the department admin has on it is marking
# it Completed. No reject, no reassigning, no other status — deliberately
# narrower than Tickets/Processes, which already cover the general case.
ADMIN_TASK_SELECT = """
  select at.id, at.title, at.status, at.created_at, at.completed_at,
         json_build_object(
           'id', au.id, 'full_name', au.full_name,
           'department', case when d.id is null then null else json_build_object('id', d.id, 'name', d.name) end
         ) as assignee,
         case when cu.id is null then null else json_build_object('id', cu.id, 'full_name', cu.full_name) end as created_by
    from admin_tasks at
    join users au on au.id = at.assigned_to
    left join departments d on d.id = au.department_id
    left join users cu on cu.id = at.created_by
"""


class AdminTaskCreateBody(BaseModel):
    title: str
    assigned_to: int


@router.get("")
def list_admin_tasks(current_user: dict = Depends(get_current_user)):
    """Super admin sees every directive they (or another super admin)
    handed out. A department admin sees only the ones assigned to them.
    Not available to general users — this is admin-to-admin only."""
    if current_user["role"] == "super_admin":
        return query(ADMIN_TASK_SELECT + " order by at.created_at desc")
    if current_user["role"] == "department_admin":
        return query(ADMIN_TASK_SELECT + " where at.assigned_to = %s order by at.created_at desc", [current_user["id"]])
    raise HTTPException(status_code=403, detail="Not available for general users.")


@router.post("", status_code=201)
def create_admin_task(body: AdminTaskCreateBody, admin: dict = Depends(require_super_admin)):
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required.")

    target = query("select role from users where id = %s", [body.assigned_to])
    if not target or target[0]["role"] != "department_admin":
        raise HTTPException(status_code=400, detail="You can only assign this to a department admin.")

    rows = query(
        "insert into admin_tasks (title, assigned_to, created_by) values (%s,%s,%s) returning id",
        [title, body.assigned_to, admin["id"]],
    )
    created = query(ADMIN_TASK_SELECT + " where at.id = %s", [rows[0]["id"]])
    return created[0]


@router.put("/{task_id}/complete")
def complete_admin_task(task_id: int, current_user: dict = Depends(get_current_user)):
    """Only the department admin this was assigned to can mark it
    Completed — not the super admin who created it, not any other
    department admin."""
    if current_user["role"] != "department_admin":
        raise HTTPException(status_code=403, detail="Only the assigned department admin can mark this completed.")

    existing = query("select assigned_to, status from admin_tasks where id = %s", [task_id])
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found.")
    if existing[0]["assigned_to"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="This task isn't assigned to you.")
    if existing[0]["status"] == "Completed":
        raise HTTPException(status_code=400, detail="Already marked completed.")

    query("update admin_tasks set status = 'Completed', completed_at = now() where id = %s", [task_id])
    updated = query(ADMIN_TASK_SELECT + " where at.id = %s", [task_id])
    return updated[0]
