from app.db import query
from app.email_utils import send_email
from app.config import ADMIN_NOTIFY_EMAIL, DEADLINE_WARNING_DAYS


def check_and_send_deadline_alerts() -> dict:
    """
    Finds processes with a due_date within DEADLINE_WARNING_DAYS, not yet
    Completed, that haven't already triggered an email. Sends one email
    per department to that department's admin(s) — so a BA deadline never
    lands in the RPA admin's inbox — plus a combined summary to
    ADMIN_NOTIFY_EMAIL (the super admin). Marks everything included as
    notified, so the same deadline doesn't re-alert every run.
    Safe to call as often as you like — it's a no-op when nothing is due.
    """
    due_processes = query(
        """select pr.id, pr.name, pr.due_date, pr.department_id,
                  p.name as project_name, dept.name as department
             from processes pr
             join projects p on p.id = pr.project_id
             join departments dept on dept.id = pr.department_id
             left join task_statuses ts on ts.id = pr.status_id
            where pr.due_date is not null
              and pr.due_date <= current_date + (%s || ' days')::interval
              and pr.deadline_notified = false
              and coalesce(ts.name, '') <> 'Completed'
            order by pr.due_date""",
        [DEADLINE_WARNING_DAYS],
    )

    if not due_processes:
        return {"emailed": False, "processes": 0}

    by_department = {}
    for p in due_processes:
        by_department.setdefault(p["department_id"], []).append(p)

    any_sent = False
    for dept_id, procs in by_department.items():
        dept_admins = query(
            "select email from users where department_id = %s and role = 'department_admin' and status = 'active'",
            [dept_id],
        )
        lines = [f"The following {procs[0]['department']} deadlines are within {DEADLINE_WARNING_DAYS} day(s):", ""]
        for p in procs:
            lines.append(f"  - {p['name']}  (project: {p['project_name']})  due {p['due_date']}")
        body_text = "\n".join(lines) + "\n\n— Ibotix PM automated deadline check"
        subject = f"[Ibotix PM] {len(procs)} deadline(s) coming up — {procs[0]['department']}"

        recipients = [a["email"] for a in dept_admins] or [ADMIN_NOTIFY_EMAIL]
        sent = all(send_email(addr, subject, body_text) for addr in recipients)
        if sent:
            any_sent = True
            query("update processes set deadline_notified = true where id = any(%s)",
                  [[p["id"] for p in procs]])

    return {"emailed": any_sent, "processes": len(due_processes)}


def check_and_send_overdue_alerts() -> dict:
    """
    Distinct from the "coming due soon" check above — this fires once a
    process's due date has actually PASSED and it's still not Completed.
    Includes who it's assigned to in the email, and clearly says the
    deadline has been exceeded (not just "coming up"). Same
    once-per-process guarantee via overdue_notified.
    """
    overdue_processes = query(
        """select pr.id, pr.name, pr.due_date, pr.department_id,
                  p.name as project_name, dept.name as department,
                  (select u.full_name from assignments a join users u on u.id = a.user_id
                    where a.process_id = pr.id limit 1) as assignee_name
             from processes pr
             join projects p on p.id = pr.project_id
             join departments dept on dept.id = pr.department_id
             left join task_statuses ts on ts.id = pr.status_id
            where pr.due_date is not null
              and pr.due_date < current_date
              and pr.overdue_notified = false
              and coalesce(ts.name, '') <> 'Completed'
            order by pr.due_date""",
    )

    if not overdue_processes:
        return {"emailed": False, "processes": 0}

    by_department = {}
    for p in overdue_processes:
        by_department.setdefault(p["department_id"], []).append(p)

    any_sent = False
    for dept_id, procs in by_department.items():
        dept_admins = query(
            "select email from users where department_id = %s and role = 'department_admin' and status = 'active'",
            [dept_id],
        )
        lines = [f"The following {procs[0]['department']} deadlines have been EXCEEDED:", ""]
        for p in procs:
            lines.append(f"  - {p['name']}  (project: {p['project_name']})  was due {p['due_date']}"
                         f"  — assigned to: {p['assignee_name'] or 'Unassigned'}")
        body_text = "\n".join(lines) + "\n\n— Ibotix PM automated overdue check"
        subject = f"[Ibotix PM] OVERDUE — {len(procs)} process(es) past due — {procs[0]['department']}"

        recipients = [a["email"] for a in dept_admins] or [ADMIN_NOTIFY_EMAIL]
        sent = all(send_email(addr, subject, body_text) for addr in recipients)
        if sent:
            any_sent = True
            query("update processes set overdue_notified = true where id = any(%s)",
                  [[p["id"] for p in procs]])

    return {"emailed": any_sent, "processes": len(overdue_processes)}
