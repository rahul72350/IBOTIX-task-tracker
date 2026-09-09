from app.db import query


def sync_hr_project_status(project_id: int):
    """HR-only automation: once every process under a project (a
    "header") is Completed, the project becomes Completed too — no
    admin action needed. The moment any process leaves Completed again
    (the admin reassigns one via the recycle button, or a brand-new
    task gets added), the project goes back to Active automatically.

    Every other department's projects are untouched by this — their
    completion still only happens through the dedicated,
    super-admin-only "Mark project complete" action.

    Safe to call after ANY process create/status change, for any
    project — it's a no-op unless that project's department is HR.
    """
    project = query(
        """select p.status_id, d.is_hr_workflow
             from projects p join departments d on d.id = p.department_id
            where p.id = %s""",
        [project_id],
    )
    if not project or not project[0]["is_hr_workflow"]:
        return
    project = project[0]

    statuses = query(
        """select ts.name as status_name
             from processes pr
             left join task_statuses ts on ts.id = pr.status_id
            where pr.project_id = %s""",
        [project_id],
    )
    if not statuses:
        return  # nothing to judge completion by yet

    completed = query("select id from project_statuses where name = 'Completed'")
    active = query("select id from project_statuses where name = 'Active'")
    if not completed or not active:
        return

    all_completed = all(s["status_name"] == "Completed" for s in statuses)

    if all_completed:
        if project["status_id"] != completed[0]["id"]:
            query("update projects set status_id = %s where id = %s", [completed[0]["id"], project_id])
    else:
        # Only reclaim it from Completed — an admin's own deliberate
        # choice (On Hold, Dropped) via Edit Project is left alone.
        if project["status_id"] == completed[0]["id"]:
            query("update projects set status_id = %s where id = %s", [active[0]["id"], project_id])
