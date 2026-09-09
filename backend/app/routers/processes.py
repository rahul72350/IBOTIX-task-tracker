from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.db import get_pool, query
import psycopg2.extras
from app.auth import get_current_user, require_admin, scope_department, assert_department_access
from app.hr_sync import sync_hr_project_status

router = APIRouter(prefix="/api/processes", tags=["Processes"])

PROCESS_SELECT = """
  select pr.id, pr.project_id, pr.sprint_id, pr.name, pr.department_id, dept.name as department,
         pr.status_id, pr.progress_pct, pr.due_date,
         pr.repeated_from, pr.created_at,
         json_build_object('id', p.id, 'name', p.name, 'department_id', p.department_id) as projects,
         case when ts.id is null then null
              else json_build_object('id', ts.id, 'name', ts.name) end as task_statuses,
         coalesce((
           select json_agg(json_build_object(
                    'id', a.id,
                    'user_id', a.user_id,
                    'profiles', json_build_object(
                      'id', u.id,
                      'full_name', u.full_name,
                      'designations', case when d.id is null then null
                                           else json_build_object('department', udept.name) end
                    )
                  ))
             from assignments a
             join users u on u.id = a.user_id
             left join designations d on d.id = u.designation_id
             left join departments udept on udept.id = d.department_id
            where a.process_id = pr.id
         ), '[]'::json) as assignments
    from processes pr
    join projects p on p.id = pr.project_id
    left join task_statuses ts   on ts.id   = pr.status_id
    left join departments   dept on dept.id = pr.department_id
"""


class ProcessCreateBody(BaseModel):
    project_id: int
    name: str
    status_id: Optional[int] = None
    assignee_id: Optional[int] = None
    due_date: Optional[str] = None
    sprint_id: Optional[int] = None


class ProcessUpdateBody(BaseModel):
    name: Optional[str] = None
    status_id: Optional[int] = None
    progress_pct: Optional[int] = None
    due_date: Optional[str] = None
    sprint_id: Optional[int] = None
    clear_sprint: Optional[bool] = False  # explicit flag, since coalesce can't set a column back to NULL


class AssignAgainBody(BaseModel):
    assignee_id: int


def _assert_project_access(current_user: dict, project_id: int) -> int:
    """A department can add processes to a project it owns OR has linked
    to (see Find Project). Returns the caller's own department_id to
    stamp the new process with. Raises 404/403 otherwise."""
    project = query("select department_id, deleted_at from projects where id = %s", [project_id])
    if not project or project[0]["deleted_at"]:
        raise HTTPException(status_code=404, detail="Project not found.")

    dept = scope_department(current_user)
    if dept is None:  # super_admin — never gets here, blocked by caller, but just in case
        return project[0]["department_id"]
    if dept == project[0]["department_id"]:
        return dept
    linked = query("select 1 from project_links where project_id = %s and department_id = %s", [project_id, dept])
    if not linked:
        raise HTTPException(status_code=403, detail="Your department isn't linked to this project — use Find Project to link it first.")
    return dept


@router.get("")
def list_processes(current_user: dict = Depends(get_current_user)):
    sql = PROCESS_SELECT
    params = []
    dept = scope_department(current_user)

    if current_user["role"] == "user":
        sql += " where exists (select 1 from assignments a where a.process_id = pr.id and a.user_id = %s)"
        params.append(current_user["id"])
    elif dept is not None:
        sql += " where pr.department_id = %s"
        params.append(dept)

    sql += " order by p.name, pr.name"
    return query(sql, params)


@router.post("", status_code=201)
def create_process(body: ProcessCreateBody, current_user: dict = Depends(get_current_user)):
    """
    Either an admin or a general user can add a process to a project
    their department owns or is linked to — this is what keeps BA and
    whichever dev team shares a project in sync: anyone on the project
    can add the next piece of work, not just the department admin.
    """
    if current_user["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin has view-only access to projects and processes.")

    department_id = _assert_project_access(current_user, body.project_id)

    if not body.name:
        raise HTTPException(status_code=400, detail="Name is required.")
    # No status picker on creation any more — every new process starts
    # In Progress rather than Not Started.
    status_id = body.status_id
    if not status_id:
        default_status = query("select id from task_statuses where name = 'In Progress' limit 1")
        status_id = default_status[0]["id"] if default_status else None

    conn = get_pool().getconn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """insert into processes (project_id, name, department_id, status_id, due_date,
                                          sprint_id, progress_pct)
                   values (%s,%s,%s,%s,%s,%s,0) returning id""",
                [body.project_id, body.name, department_id, status_id, body.due_date,
                 body.sprint_id],
            )
            process_id = cur.fetchone()["id"]
            if body.assignee_id:
                assignee = query("select department_id from users where id = %s", [body.assignee_id])
                if not assignee or assignee[0]["department_id"] != department_id:
                    raise HTTPException(status_code=400, detail="That person isn't in this department.")
                cur.execute(
                    "insert into assignments (user_id, project_id, process_id) values (%s,%s,%s)",
                    [body.assignee_id, body.project_id, process_id],
                )
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        get_pool().putconn(conn)

    # HR-only: a brand-new task (starting In Progress) reactivates a
    # project that had auto-completed — see hr_sync.
    sync_hr_project_status(body.project_id)

    created = query(PROCESS_SELECT + " where pr.id = %s", [process_id])
    return created[0]


@router.put("/{process_id}")
def update_process(process_id: int, body: ProcessUpdateBody, admin: dict = Depends(require_admin)):
    if admin["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin has view-only access to projects and processes.")
    existing = query("select department_id, project_id from processes where id = %s", [process_id])
    if not existing:
        raise HTTPException(status_code=404, detail="Process not found.")
    assert_department_access(admin, existing[0]["department_id"])

    reset_notified = body.due_date is not None
    sprint_clause = "sprint_id = null" if body.clear_sprint else "sprint_id = coalesce(%(sprint_id)s, sprint_id)"
    rows = query(
        f"""update processes set name = coalesce(%(name)s,name),
                                status_id = coalesce(%(status_id)s,status_id),
                                progress_pct = coalesce(%(progress_pct)s,progress_pct),
                                due_date = coalesce(%(due_date)s,due_date),
                                {sprint_clause}
                                {", deadline_notified = false, overdue_notified = false" if reset_notified else ""}
            where id = %(process_id)s returning id""",
        {
            "name": body.name, "status_id": body.status_id, "progress_pct": body.progress_pct,
            "due_date": body.due_date,
            "sprint_id": body.sprint_id, "process_id": process_id,
        },
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Process not found.")

    if body.status_id is not None:
        sync_hr_project_status(existing[0]["project_id"])

    updated = query(PROCESS_SELECT + " where pr.id = %s", [process_id])
    return updated[0]


@router.delete("/{process_id}")
def delete_process(process_id: int, admin: dict = Depends(require_admin)):
    if admin["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin has view-only access to projects and processes.")
    existing = query("select department_id, project_id from processes where id = %s", [process_id])
    if not existing:
        raise HTTPException(status_code=404, detail="Process not found.")
    assert_department_access(admin, existing[0]["department_id"])

    query("delete from processes where id = %s", [process_id])
    sync_hr_project_status(existing[0]["project_id"])
    return {"ok": True}


@router.post("/{process_id}/assign-again", status_code=201)
def assign_again(process_id: int, body: AssignAgainBody, admin: dict = Depends(require_admin)):
    """
    HR's recurring-work shortcut (the recycle button): hands this same
    task to someone — new or the same person — in place. No new process
    row, nothing extra shows up in the project's process list; this row
    just gets a new assignee and its status set to In Progress.
    """
    if admin["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin has view-only access to projects and processes.")
    original = query("select project_id, department_id from processes where id = %s", [process_id])
    if not original:
        raise HTTPException(status_code=404, detail="Process not found.")
    original = original[0]
    assert_department_access(admin, original["department_id"])

    assignee = query("select department_id from users where id = %s", [body.assignee_id])
    if not assignee or assignee[0]["department_id"] != original["department_id"]:
        raise HTTPException(status_code=400, detail="That person isn't in this department.")

    in_progress = query("select id from task_statuses where name = 'In Progress' limit 1")
    status_id = in_progress[0]["id"] if in_progress else None

    query("delete from assignments where process_id = %s", [process_id])
    query("insert into assignments (user_id, project_id, process_id) values (%s,%s,%s)",
          [body.assignee_id, original["project_id"], process_id])
    # Fresh handoff, fresh progress — otherwise a task recycled after being
    # Completed would show 100% while sitting at "In Progress", which reads
    # as if the reassignment never really took for the person picking it up.
    query("update processes set status_id = coalesce(%s, status_id), progress_pct = 0 where id = %s", [status_id, process_id])

    # HR-only: this process going back to In Progress means the project
    # (the "header") can't still be Completed — see hr_sync.
    sync_hr_project_status(original["project_id"])

    updated = query(PROCESS_SELECT + " where pr.id = %s", [process_id])
    return updated[0]
