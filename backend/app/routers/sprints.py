from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from app.db import query
from app.auth import get_current_user, require_admin, scope_department, assert_department_access
from app.sprint_forwarding import close_sprint_and_forward

router = APIRouter(prefix="/api/sprints", tags=["Sprints"])

SPRINT_ELIGIBLE_DEPARTMENTS = ("RPA", "Data Science")

SPRINT_SELECT = """
  select s.id, s.project_id, s.name, s.goal, s.start_date, s.end_date, s.status,
         json_build_object('id', p.id, 'name', p.name, 'department_id', p.department_id) as projects,
         dept.name as department,
         (select count(*)::int from processes pr where pr.sprint_id = s.id) as total_processes,
         (select count(*)::int from processes pr
            join task_statuses ts on ts.id = pr.status_id
           where pr.sprint_id = s.id and ts.name = 'Completed') as completed_processes
    from sprints s
    join projects p on p.id = s.project_id
    join departments dept on dept.id = p.department_id
"""


class SprintCreateBody(BaseModel):
    project_id: int
    name: str
    goal: Optional[str] = None
    start_date: str
    end_date: str


class SprintUpdateBody(BaseModel):
    name: Optional[str] = None
    goal: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None


def _assert_sprint_eligible(project_id: int, current_user: dict):
    project = query("select department_id from projects where id = %s", [project_id])
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    assert_department_access(current_user, project[0]["department_id"])
    dept = query("select name from departments where id = %s", [project[0]["department_id"]])
    if not dept or dept[0]["name"] not in SPRINT_ELIGIBLE_DEPARTMENTS:
        raise HTTPException(status_code=400, detail="Sprints are only available for RPA and Data Science projects.")
    return project[0]["department_id"]


@router.get("")
def list_sprints(project_id: Optional[int] = Query(None), current_user: dict = Depends(get_current_user)):
    sql = SPRINT_SELECT
    params = []
    dept = scope_department(current_user)

    if current_user["role"] == "user":
        sql += """ where exists (
            select 1 from assignments a join processes pr on pr.id = a.process_id
             where pr.sprint_id = s.id and a.user_id = %s)"""
        params.append(current_user["id"])
    elif dept is not None:
        sql += " where p.department_id = %s"
        params.append(dept)
    else:
        sql += " where dept.name in %s"
        params.append(SPRINT_ELIGIBLE_DEPARTMENTS)

    if project_id:
        sql += (" and" if params and "where" in sql else " where") + " s.project_id = %s"
        params.append(project_id)

    sql += " order by s.start_date desc"
    return query(sql, params)


@router.post("", status_code=201)
def create_sprint(body: SprintCreateBody, admin: dict = Depends(require_admin)):
    _assert_sprint_eligible(body.project_id, admin)
    rows = query(
        """insert into sprints (project_id, name, goal, start_date, end_date)
           values (%s,%s,%s,%s,%s) returning id""",
        [body.project_id, body.name, body.goal, body.start_date, body.end_date],
    )
    created = query(SPRINT_SELECT + " where s.id = %s", [rows[0]["id"]])
    return created[0]


@router.put("/{sprint_id}")
def update_sprint(sprint_id: int, body: SprintUpdateBody, admin: dict = Depends(require_admin)):
    existing = query("select project_id from sprints where id = %s", [sprint_id])
    if not existing:
        raise HTTPException(status_code=404, detail="Sprint not found.")
    _assert_sprint_eligible(existing[0]["project_id"], admin)

    if body.status and body.status not in ("Planned", "Active", "Completed"):
        raise HTTPException(status_code=400, detail="Invalid status.")

    query(
        """update sprints set name = coalesce(%s,name), goal = coalesce(%s,goal),
                              start_date = coalesce(%s,start_date), end_date = coalesce(%s,end_date),
                              status = coalesce(%s,status)
            where id = %s""",
        [body.name, body.goal, body.start_date, body.end_date, body.status, sprint_id],
    )
    updated = query(SPRINT_SELECT + " where s.id = %s", [sprint_id])
    return updated[0]


@router.post("/{sprint_id}/close")
def close_sprint(sprint_id: int, admin: dict = Depends(require_admin)):
    """
    Closes the sprint right now instead of waiting for its end date —
    unfinished processes forward to the next sprint (or the backlog)
    exactly like the automatic end-of-sprint job does.
    """
    existing = query("select project_id from sprints where id = %s", [sprint_id])
    if not existing:
        raise HTTPException(status_code=404, detail="Sprint not found.")
    _assert_sprint_eligible(existing[0]["project_id"], admin)

    result = close_sprint_and_forward(sprint_id)
    return result


@router.get("/{sprint_id}/board")
def sprint_board(sprint_id: int, current_user: dict = Depends(get_current_user)):
    sprint = query("select project_id from sprints where id = %s", [sprint_id])
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found.")

    rows = query(
        """select pr.id, pr.name, pr.department_id, dept.name as department, pr.progress_pct, pr.due_date,
                  case when ts.id is null then null else json_build_object('id', ts.id, 'name', ts.name) end as task_statuses,
                  coalesce((
                     select json_agg(json_build_object('user_id', a.user_id, 'full_name', u.full_name))
                       from assignments a join users u on u.id = a.user_id
                      where a.process_id = pr.id
                  ), '[]'::json) as assignments
             from processes pr
             left join task_statuses ts on ts.id = pr.status_id
             left join departments dept on dept.id = pr.department_id
            where pr.sprint_id = %s
            order by pr.name""",
        [sprint_id],
    )
    return rows
