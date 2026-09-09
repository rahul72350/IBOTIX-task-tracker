from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from app.db import query
from app.auth import get_current_user, require_admin, require_super_admin, scope_department, assert_department_access

router = APIRouter(prefix="/api/projects", tags=["Projects"])


def _project_select(dept_scope: Optional[int]) -> str:
    """PROJECT_SELECT, with the embedded processes list scoped to one
    department. The project itself is still ONE shared row — name,
    client, status — visible to every owning/linked department alike.
    But each department's WORK on it is private to them: a project
    that's shared is not a project whose processes are shared. Linking
    to someone else's project starts you with an empty process list;
    you build your own department's work under it from there.

    dept_scope is always an already-validated int from
    scope_department() (or None for super_admin / this action's
    identity-based override) — never raw user input — so it's safe to
    inline directly rather than parameterize.
    """
    dept_filter = f" and pr.department_id = {int(dept_scope)}" if dept_scope is not None else ""
    return f"""
      select p.id, p.name, p.client_name, p.category, p.department_id, p.start_date, p.priority_id,
             pri.name as priority,
             p.description, p.status_id, p.created_at, p.deleted_at,
             json_build_object('id', dept.id, 'name', dept.name, 'is_hr_workflow', dept.is_hr_workflow) as departments,
             case when ps.id is null then null
                  else json_build_object('id', ps.id, 'name', ps.name)
             end as project_statuses,
             coalesce((
               select json_agg(json_build_object('id', ld.id, 'name', ld.name))
                 from project_links pl join departments ld on ld.id = pl.department_id
                where pl.project_id = p.id
             ), '[]'::json) as linked_departments,
             coalesce((
               select json_agg(proc order by proc->>'name')
                 from (
                   select json_build_object(
                     'id', pr.id,
                     'name', pr.name,
                     'department_id', pr.department_id,
                     'department', dept2.name,
                     'progress_pct', pr.progress_pct,
                     'due_date', pr.due_date,
                     'status_id', pr.status_id,
                     'repeated_from', pr.repeated_from,
                     'task_statuses', case when ts.id is null then null
                                           else json_build_object('id', ts.id, 'name', ts.name) end,
                     'assignments', coalesce((
                        select json_agg(json_build_object(
                                 'id', a.id,
                                 'user_id', a.user_id,
                                 'profiles', json_build_object('id', u.id, 'full_name', u.full_name, 'role', u.role)
                               ))
                          from assignments a
                          join users u on u.id = a.user_id
                         where a.process_id = pr.id
                     ), '[]'::json)
                   ) as proc
                     from processes pr
                     left join task_statuses ts on ts.id = pr.status_id
                     left join departments dept2 on dept2.id = pr.department_id
                    where pr.project_id = p.id{dept_filter}
                 ) sub
             ), '[]'::json) as processes
        from projects p
        left join project_statuses ps  on ps.id  = p.status_id
        left join priorities       pri on pri.id = p.priority_id
        join departments dept on dept.id = p.department_id
    """


# Unscoped variant — every department's processes together. Only for
# super_admin's own view, which was always meant to see everything.
PROJECT_SELECT = _project_select(None)


class ProjectCreateBody(BaseModel):
    name: str
    client_name: str
    category: Optional[str] = "Delivery"
    department_id: Optional[int] = None  # required for super_admin; forced to own dept otherwise
    start_date: str
    priority_id: Optional[int] = None
    priority: Optional[str] = None
    status_id: Optional[int] = None  # omit on create — new projects always start Active
    description: Optional[str] = None


class LinkProjectBody(BaseModel):
    project_id: int


def resolve_priority_id(priority_id: Optional[int], priority_name: Optional[str]) -> Optional[int]:
    if priority_id:
        return priority_id
    if priority_name:
        rows = query("select id from priorities where name = %s", [priority_name])
        if rows:
            return rows[0]["id"]
    fallback = query("select id from priorities where name = 'Medium' limit 1")
    return fallback[0]["id"] if fallback else None


def _visible_project_ids_clause(current_user: dict):
    """A department sees a project if it owns it OR has linked to it. A
    super_admin sees every department's EXCEPT HR OPS TEAM / HR OPS —
    those are hidden from super admin entirely, not just excluded from
    aggregate counts and dashboard overviews. Returns (sql_fragment, params)."""
    dept = scope_department(current_user)
    if dept is None:
        return (
            " and not exists (select 1 from departments hd where hd.id = p.department_id and hd.is_hr_workflow)",
            [],
        )
    return (
        " and (p.department_id = %s or exists (select 1 from project_links pl where pl.project_id = p.id and pl.department_id = %s))",
        [dept, dept],
    )


@router.get("")
def list_projects(
    limit: Optional[int] = Query(None, ge=1, le=200),
    offset: Optional[int] = Query(None, ge=0),
    current_user: dict = Depends(get_current_user),
):
    # Each viewer sees only their own department's processes on a project
    # (super_admin sees every department's, since their view was always
    # meant to be the full picture) — see _project_select.
    sql = _project_select(scope_department(current_user)) + " where p.deleted_at is null"
    params = []

    if current_user["role"] == "user":
        sql += " and exists (select 1 from assignments a where a.project_id = p.id and a.user_id = %s)"
        params.append(current_user["id"])
    else:
        clause, clause_params = _visible_project_ids_clause(current_user)
        sql += clause
        params.extend(clause_params)

    sql += " order by p.created_at desc"
    if limit:
        sql += " limit %s offset %s"
        params.extend([limit, offset or 0])
    return query(sql, params)


@router.get("/find/{project_id}")
def find_project(project_id: int, admin: dict = Depends(require_admin)):
    """
    Looks up ANY project by its id, regardless of department — this is
    what powers "Find Project": search by id, see enough to decide
    whether to link it, without exposing its full process list until
    you actually do. Doesn't require ownership or an existing link.
    """
    rows = query("""
        select p.id, p.name, p.client_name, p.category, p.start_date, p.deleted_at,
               json_build_object('id', dept.id, 'name', dept.name) as departments,
               case when ps.id is null then null else json_build_object('id', ps.id, 'name', ps.name) end as project_statuses,
               exists (select 1 from project_links pl where pl.project_id = p.id and pl.department_id = %s) as already_linked
          from projects p
          join departments dept on dept.id = p.department_id
          left join project_statuses ps on ps.id = p.status_id
         where p.id = %s
    """, [scope_department(admin), project_id])
    if not rows:
        raise HTTPException(status_code=404, detail="No project found with that id.")
    if rows[0]["deleted_at"]:
        raise HTTPException(status_code=404, detail="That project has been deleted.")
    return rows[0]


@router.post("/link", status_code=201)
def link_project(body: LinkProjectBody, admin: dict = Depends(require_admin)):
    """Links the caller's department to an existing project (found via
    Find Project) instead of duplicating it. From then on, this
    department can add its own processes under that same project."""
    if admin["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin has view-only access to projects.")
    dept = scope_department(admin)

    project = query("select department_id, deleted_at from projects where id = %s", [body.project_id])
    if not project or project[0]["deleted_at"]:
        raise HTTPException(status_code=404, detail="Project not found.")
    if project[0]["department_id"] == dept:
        raise HTTPException(status_code=400, detail="Your department already owns this project.")

    existing_link = query("select 1 from project_links where project_id = %s and department_id = %s", [body.project_id, dept])
    if existing_link:
        raise HTTPException(status_code=409, detail="Your department is already linked to this project.")

    query("insert into project_links (project_id, department_id, linked_by) values (%s,%s,%s)",
          [body.project_id, dept, admin["id"]])
    # Fresh link starts with an empty process list for this department —
    # the other department's existing work doesn't come along with it.
    linked = query(_project_select(dept) + " where p.id = %s", [body.project_id])
    return linked[0]


@router.post("", status_code=201)
def create_project(body: ProjectCreateBody, admin: dict = Depends(require_admin)):
    if admin["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin has view-only access to projects.")
    dept = scope_department(admin)
    department_id = dept if dept is not None else body.department_id
    if not department_id:
        raise HTTPException(status_code=400, detail="Department is required.")
    assert_department_access(admin, department_id)

    resolved_priority = resolve_priority_id(body.priority_id, body.priority)
    # No status picker on creation — every new project starts Active.
    status_id = body.status_id
    if not status_id:
        active = query("select id from project_statuses where name = 'Active' limit 1")
        status_id = active[0]["id"] if active else None

    rows = query(
        """insert into projects (name, client_name, category, department_id, start_date, priority_id, status_id, description, created_by)
           values (%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id""",
        [body.name, body.client_name, body.category or "Delivery", department_id, body.start_date,
         resolved_priority, status_id, body.description, admin["id"]],
    )
    created = query(_project_select(department_id) + " where p.id = %s", [rows[0]["id"]])
    return created[0]


@router.put("/{project_id}")
def update_project(project_id: int, body: ProjectCreateBody, admin: dict = Depends(require_admin)):
    if admin["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin has view-only access to projects.")
    existing = query("select department_id, status_id from projects where id = %s and deleted_at is null", [project_id])
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found.")
    # Only the OWNING department can edit the project's own details — a
    # linked department can add processes but shouldn't rename someone
    # else's project out from under them.
    assert_department_access(admin, existing[0]["department_id"])

    # Marking a project Completed only ever happens through the dedicated
    # endpoint below (restricted to one person) — block it here so that
    # door can't be used to route around that restriction.
    status_id = body.status_id or existing[0]["status_id"]
    completed = query("select id from project_statuses where name = 'Completed'")
    if completed and status_id == completed[0]["id"]:
        raise HTTPException(status_code=403, detail="Marking a project Completed only happens via \"Mark project complete\", not here.")

    resolved_priority = resolve_priority_id(body.priority_id, body.priority)
    query(
        """update projects set name=%s, client_name=%s, category=coalesce(%s,category), start_date=%s,
                               priority_id=%s, status_id=%s, description=%s where id=%s""",
        [body.name, body.client_name, body.category, body.start_date, resolved_priority,
         status_id, body.description, project_id],
    )
    updated = query(_project_select(scope_department(admin)) + " where p.id = %s", [project_id])
    return updated[0]


@router.post("/{project_id}/complete")
def complete_project(project_id: int, admin: dict = Depends(require_super_admin)):
    """Dedicated "mark project complete" action — super admin only. No
    department admin, of any department, can do this — including
    Bhumika, who no longer gets any special-cased exception. The general
    Edit Project form can no longer set a project to Completed at all
    (see update_project) — this is the only door. A super admin's reach
    is every project, not bounded to one department, since
    scope_department() returns None for them."""
    existing = query("select department_id from projects where id = %s and deleted_at is null", [project_id])
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found.")

    completed = query("select id from project_statuses where name = 'Completed'")
    if not completed:
        raise HTTPException(status_code=400, detail='No "Completed" project status is configured — ask a super admin to add one under Configure.')

    query("update projects set status_id = %s where id = %s", [completed[0]["id"], project_id])
    updated = query(_project_select(None) + " where p.id = %s", [project_id])
    return updated[0]


@router.delete("/{project_id}")
def delete_project(project_id: int, admin: dict = Depends(require_admin)):
    """
    Soft delete only — hides it from active project lists everywhere,
    but every process, task update, and ticket that ever referenced it
    stays exactly as it was, for reports and audit history.
    """
    if admin["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin has view-only access to projects.")
    existing = query("select department_id from projects where id = %s and deleted_at is null", [project_id])
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found.")
    assert_department_access(admin, existing[0]["department_id"])

    query("update projects set deleted_at = now() where id = %s", [project_id])
    return {"ok": True}
