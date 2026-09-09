from app.db import query


def _find_next_sprint(project_id: int, after_sprint_id: int, after_end_date):
    """The sprint for this project that starts soonest after the one
    closing — that's where unfinished work lands. None if there isn't one
    yet, in which case work goes back to the backlog instead."""
    rows = query(
        """select id from sprints
            where project_id = %s and id <> %s and status in ('Planned','Active')
              and start_date >= %s
            order by start_date asc
            limit 1""",
        [project_id, after_sprint_id, after_end_date],
    )
    return rows[0]["id"] if rows else None


def close_sprint_and_forward(sprint_id: int) -> dict:
    """
    Closes a sprint: anything not yet Completed moves to the next sprint
    for the same project (by start date), or back to the backlog if none
    exists. Marks the sprint Completed. Idempotent-ish — closing an
    already-Completed sprint just finds nothing to move.
    """
    sprint = query("select id, project_id, end_date, status from sprints where id = %s", [sprint_id])
    if not sprint:
        return {"closed": False, "moved": 0, "target": None}
    sprint = sprint[0]

    incomplete = query(
        """select pr.id from processes pr
             left join task_statuses ts on ts.id = pr.status_id
            where pr.sprint_id = %s and coalesce(ts.name, '') <> 'Completed'""",
        [sprint_id],
    )
    process_ids = [r["id"] for r in incomplete]

    next_sprint_id = _find_next_sprint(sprint["project_id"], sprint_id, sprint["end_date"]) if process_ids else None

    if process_ids:
        query("update processes set sprint_id = %s where id = any(%s)", [next_sprint_id, process_ids])

    query("update sprints set status = 'Completed' where id = %s", [sprint_id])

    return {
        "closed": True,
        "moved": len(process_ids),
        "target": "next_sprint" if next_sprint_id else "backlog",
        "next_sprint_id": next_sprint_id,
    }


def auto_forward_expired_sprints() -> dict:
    """
    Background job: any Active sprint whose end_date has already passed
    gets closed automatically, forwarding its unfinished work exactly like
    a manual close would. Meant to run daily.
    """
    expired = query("select id from sprints where status = 'Active' and end_date < current_date")
    results = [close_sprint_and_forward(row["id"]) for row in expired]
    total_moved = sum(r["moved"] for r in results)
    return {"sprints_closed": len(expired), "processes_moved": total_moved}
