from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional

from app.db import query
from app.auth import get_current_user, require_admin, scope_department, assert_department_access

router = APIRouter(prefix="/api/stats", tags=["Stats"])


@router.get("/admin-dashboard")
def admin_dashboard(admin: dict = Depends(require_admin)):
    dept = scope_department(admin)
    dept_filter = "and p.department_id = %(dept)s" if dept is not None else ""
    proc_dept_filter = "and pr.department_id = %(dept)s" if dept is not None else ""
    user_dept_filter = "and u.department_id = %(dept)s" if dept is not None else ""
    params = {"dept": dept}

    # HR OPS TEAM / HR OPS aren't shown to a super admin at all — not
    # just excluded from the project counts, every number on their
    # dashboard leaves HR out entirely. A department_admin's own
    # dashboard is unaffected — it's already scoped to their own single
    # department, HR included, which is exactly what an HR admin expects
    # to see of their own team.
    hr_exclude_proj = "and not d.is_hr_workflow" if dept is None else ""
    hr_exclude_user = "and not ud.is_hr_workflow" if dept is None else ""
    hr_exclude_proc = "and not prd.is_hr_workflow" if dept is None else ""

    active = query(f"""select count(*)::int as n from projects p
                         join project_statuses ps on ps.id = p.status_id
                         join departments d on d.id = p.department_id
                        where ps.name = 'Active' {hr_exclude_proj} {dept_filter}""", params)
    total_projects = query(f"""select count(*)::int as n from projects p
                                 join departments d on d.id = p.department_id
                                where true {hr_exclude_proj} {dept_filter}""", params)
    # Super admin's total counts everyone, department admins included —
    # that's the real headcount across the company. A department_admin's
    # own dashboard excludes only themselves — they manage their team's
    # headcount, they aren't part of it — every general user still counts.
    dept_admin_exclude = "and u.role != 'department_admin'" if dept is not None else ""
    team = query(f"""select count(*)::int as n from users u
                       left join departments ud on ud.id = u.department_id
                      where u.status = 'active' {dept_admin_exclude}
                        {hr_exclude_user} {user_dept_filter}""", params)
    todays = query(f"""select count(distinct tu.user_id)::int as n from task_updates tu
                        join processes pr on pr.id = tu.process_id
                        left join departments prd on prd.id = pr.department_id
                        where tu.entry_date = current_date {hr_exclude_proc} {proc_dept_filter}""", params)
    pending = query(f"""select count(*)::int as n from processes pr
                         join task_statuses ts on ts.id = pr.status_id
                         left join departments prd on prd.id = pr.department_id
                        where ts.name <> 'Completed'
                          and exists (select 1 from assignments a where a.process_id = pr.id)
                          {hr_exclude_proc} {proc_dept_filter}""", params)
    in_progress = query(f"""select count(*)::int as n from processes pr
                         join task_statuses ts on ts.id = pr.status_id
                         left join departments prd on prd.id = pr.department_id
                        where ts.name = 'In Progress' {hr_exclude_proc} {proc_dept_filter}""", params)
    completed = query(f"""select count(*)::int as n from processes pr
                         join task_statuses ts on ts.id = pr.status_id
                         left join departments prd on prd.id = pr.department_id
                        where ts.name = 'Completed' {hr_exclude_proc} {proc_dept_filter}""", params)

    result = {
        "activeProjects": active[0]["n"],
        "totalProjects": total_projects[0]["n"],
        "teamMembers": team[0]["n"],
        "todaysUpdates": todays[0]["n"],
        "totalUsers": team[0]["n"],
        "pendingProcesses": pending[0]["n"],
        "inProgressProcesses": in_progress[0]["n"],
        "completedProcesses": completed[0]["n"],
    }

    # Super admin's dashboard shows a cross-department projects overview:
    # project / department / status / everyone currently assigned to it.
    # HR OPS TEAM / HR OPS are excluded entirely — not shown to a super
    # admin anywhere, not even in a separate section.
    if dept is None:
        overview = query("""
            select p.id, p.name, dept.name as department,
                   json_build_object('id', ps.id, 'name', ps.name) as status,
                   coalesce((
                     select json_agg(json_build_object('full_name', u.full_name, 'department', dept.name))
                       from assignments a
                       join processes pr2 on pr2.id = a.process_id
                       join users u on u.id = a.user_id
                      where pr2.project_id = p.id
                   ), '[]'::json) as team
              from projects p
              join departments dept on dept.id = p.department_id
              left join project_statuses ps on ps.id = p.status_id
             where not dept.is_hr_workflow
             order by p.created_at desc
             limit 10
        """)
        result["projectsOverview"] = overview

    return result


@router.get("/my-dashboard")
def my_dashboard(current_user: dict = Depends(get_current_user)):
    week = query(
        """select coalesce(sum(duration_hours),0)::float as hrs
             from task_updates
            where user_id = %s and entry_date >= date_trunc('week', current_date)""",
        [current_user["id"]],
    )
    # Only counts a log toward "today" if it happened after the CURRENT
    # assignment started — otherwise reassigning a process someone
    # already logged earlier today (e.g. completed this morning, handed
    # back to them this evening) would still show as "logged today" from
    # the old, since-superseded log, hiding the fact that the fresh
    # handoff genuinely hasn't been reported on yet.
    today = query(
        """select tu.process_id
             from task_updates tu
             join assignments a on a.process_id = tu.process_id and a.user_id = tu.user_id
            where tu.user_id = %s and tu.entry_date = current_date
              and tu.created_at >= a.assigned_at""",
        [current_user["id"]],
    )
    # All-time — not just today — so "processes logged" can report actual
    # reporting coverage across everything ever assigned, not a daily nag.
    ever = query(
        "select distinct process_id from task_updates where user_id = %s",
        [current_user["id"]],
    )
    return {
        "weekHours": week[0]["hrs"],
        "loggedProcessIdsToday": [r["process_id"] for r in today],
        "loggedProcessIdsEver": [r["process_id"] for r in ever],
    }


@router.get("/activity-heatmap")
def activity_heatmap(
    department_id: Optional[int] = Query(None),
    days: Optional[int] = Query(371),
    admin: dict = Depends(require_admin),
):
    dept = scope_department(admin)
    if dept is not None:
        if department_id and department_id != dept:
            raise HTTPException(status_code=403, detail="That belongs to a different department.")
        department_id = dept  # department_admin is always scoped to their own, regardless of query param

    days = min(max(days or 371, 7), 731)
    rows = query(
        """select tu.entry_date::text as date, count(*)::int as count
             from task_updates tu
             join processes pr on pr.id = tu.process_id
            where tu.entry_date >= current_date - (%s::int - 1) * interval '1 day'
              and (%s::int is null or pr.department_id = %s::int)
            group by tu.entry_date
            order by tu.entry_date""",
        [days, department_id, department_id],
    )
    return {"from": None, "days": rows}


@router.get("/analytics")
def analytics(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    admin: dict = Depends(require_admin),
):
    dept = scope_department(admin)
    rows = query(
        """select tu.entry_date, tu.duration_hours::float as duration_hours,
                  p.name  as project_name,
                  u.full_name as user_name,
                  dept.name as department,
                  ts.name as status_name
             from task_updates tu
             join projects  p  on p.id  = tu.project_id
             join processes pr on pr.id = tu.process_id
             join users     u  on u.id  = tu.user_id
             left join task_statuses ts   on ts.id   = tu.status_id
             left join departments   dept on dept.id = pr.department_id
            where (%s::date is null or tu.entry_date >= %s::date)
              and (%s::date is null or tu.entry_date <= %s::date)
              and (%s::int is null or pr.department_id = %s::int)
            order by tu.entry_date""",
        [from_, from_, to, to, dept, dept],
    )
    return {"rows": rows}


@router.get("/project-report/{project_id}")
def project_report(project_id: int, admin: dict = Depends(require_admin)):
    project = query("select department_id from projects where id = %s", [project_id])
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    assert_department_access(admin, project[0]["department_id"])

    rows = query(
        """select coalesce(sum(tu.duration_hours),0)::float as total_hours,
                  dept.name as department,
                  sum(tu.duration_hours)::float as dept_hours
             from task_updates tu
             join processes pr on pr.id = tu.process_id
             left join departments dept on dept.id = pr.department_id
            where tu.project_id = %s
            group by rollup (dept.name)""",
        [project_id],
    )
    return rows


