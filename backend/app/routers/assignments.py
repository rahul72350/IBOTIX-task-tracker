from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from app.db import query
from app.auth import get_current_user, require_admin, scope_department, assert_department_access

router = APIRouter(prefix="/api/assignments", tags=["Assignments"])


class AssignmentCreateBody(BaseModel):
    user_id: int
    project_id: int
    process_id: int


@router.get("")
def list_assignments(
    mine: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    is_mine = mine == "1" or current_user["role"] == "user"
    dept = scope_department(current_user)
    where = []
    params = []

    if is_mine:
        where.append("a.user_id = %s")
        params.append(current_user["id"])
    elif user_id:
        where.append("a.user_id = %s")
        params.append(user_id)

    if dept is not None:  # department_admin never sees another department's assignments
        where.append("pr.department_id = %s")
        params.append(dept)

    sql = f"""
      select a.id, a.user_id, a.project_id, a.process_id, a.assigned_at,
             json_build_object('id', p.id, 'name', p.name) as projects,
             json_build_object(
               'id', pr.id, 'name', pr.name, 'department', dept.name,
               'progress_pct', pr.progress_pct,
               'task_statuses', case when ts.id is null then null
                                     else json_build_object('id', ts.id, 'name', ts.name) end
             ) as processes,
             json_build_object('id', u.id, 'full_name', u.full_name) as profiles
        from assignments a
        join projects  p  on p.id  = a.project_id
        join processes pr on pr.id = a.process_id
        join users     u  on u.id  = a.user_id
        left join task_statuses ts   on ts.id   = pr.status_id
        left join departments   dept on dept.id = pr.department_id
        {"where " + " and ".join(where) if where else ""}
       order by p.name, pr.name
    """
    return query(sql, params)


@router.post("", status_code=201)
def create_assignment(body: AssignmentCreateBody, admin: dict = Depends(require_admin)):
    if admin["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin has view-only access to projects and processes.")
    process = query("select department_id from processes where id = %s", [body.process_id])
    if not process:
        raise HTTPException(status_code=404, detail="Process not found.")
    assert_department_access(admin, process[0]["department_id"])

    user = query("select department_id from users where id = %s", [body.user_id])
    if not user or user[0]["department_id"] != process[0]["department_id"]:
        raise HTTPException(status_code=400, detail="That person isn't in this process's department.")

    query(
        """insert into assignments (user_id, project_id, process_id)
           values (%s,%s,%s)
           on conflict (process_id)
           do update set user_id = excluded.user_id,
                         project_id = excluded.project_id,
                         assigned_at = now()""",
        [body.user_id, body.project_id, body.process_id],
    )
    return {"ok": True}


@router.delete("/{process_id}")
def delete_assignment(process_id: int, admin: dict = Depends(require_admin)):
    if admin["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin has view-only access to projects and processes.")
    process = query("select department_id from processes where id = %s", [process_id])
    if process:
        assert_department_access(admin, process[0]["department_id"])
    query("delete from assignments where process_id = %s", [process_id])
    return {"ok": True}
