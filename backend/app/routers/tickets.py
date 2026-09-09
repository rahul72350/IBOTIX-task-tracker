from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.db import query
from app.auth import get_current_user, require_admin, scope_department
from app.email_utils import send_email

router = APIRouter(prefix="/api/tickets", tags=["Tickets"])

# description is always included here — it must be visible wherever a
# ticket shows up, not hidden behind an extra click.
TICKET_SELECT = """
  select t.id, t.title, t.description, t.raised_by, t.from_department_id, t.to_department_id,
         t.priority_id, t.status, t.response_notes, t.created_at, t.updated_at,
         json_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email) as profiles,
         json_build_object('id', fd.id, 'name', fd.name) as from_department,
         json_build_object('id', td.id, 'name', td.name) as to_department,
         case when pri.id is null then null else json_build_object('id', pri.id, 'name', pri.name) end as priorities
    from tickets t
    join users u on u.id = t.raised_by
    join departments fd on fd.id = t.from_department_id
    join departments td on td.id = t.to_department_id
    left join priorities pri on pri.id = t.priority_id
"""


class TicketCreateBody(BaseModel):
    title: str
    description: str
    to_department_id: int
    priority_id: Optional[int] = None


class TicketDecisionBody(BaseModel):
    status: str  # 'Accepted' | 'Rejected'
    response_notes: Optional[str] = None


class TicketStatusBody(BaseModel):
    status: str  # 'In Progress' | 'Completed'


@router.get("")
def list_tickets(current_user: dict = Depends(get_current_user)):
    """
    A department_admin sees tickets that involve their own department
    (raised by them/their team, or addressed to them) — never another
    department's unrelated traffic. A super_admin sees everything.
    There's no per-user assignment any more, so a general user has
    nothing to see here — tickets are a department-to-department
    conversation, handled entirely by the two admins involved.
    """
    sql = TICKET_SELECT
    params = []
    dept = scope_department(current_user)
    if dept is not None:
        sql += " where t.from_department_id = %s or t.to_department_id = %s"
        params.extend([dept, dept])

    sql += " order by t.created_at desc"
    return query(sql, params)


@router.post("", status_code=201)
def create_ticket(body: TicketCreateBody, current_user: dict = Depends(get_current_user)):
    """A department admin raises a ticket to another department. It
    always comes from the raiser's own department."""
    if current_user["role"] != "department_admin":
        raise HTTPException(status_code=403, detail="Only a department admin can raise a ticket.")
    dept = scope_department(current_user)
    if dept == body.to_department_id:
        raise HTTPException(status_code=400, detail="Pick a different department to send this ticket to.")

    target = query("select id from departments where id = %s", [body.to_department_id])
    if not target:
        raise HTTPException(status_code=404, detail="Target department not found.")

    rows = query(
        """insert into tickets (title, description, raised_by, from_department_id, to_department_id, priority_id)
           values (%s,%s,%s,%s,%s,%s) returning id""",
        [body.title, body.description, current_user["id"], dept, body.to_department_id, body.priority_id],
    )
    created = query(TICKET_SELECT + " where t.id = %s", [rows[0]["id"]])
    return created[0]


@router.put("/{ticket_id}/decision")
def decide_ticket(ticket_id: int, body: TicketDecisionBody, admin: dict = Depends(require_admin)):
    """
    The RECEIVING department's admin — acting as department head here —
    accepts or rejects an incoming ticket. Only possible while it's
    still Open.
    """
    if body.status not in ("Accepted", "Rejected"):
        raise HTTPException(status_code=400, detail="Decision must be 'Accepted' or 'Rejected'.")

    existing = query("select to_department_id, status from tickets where id = %s", [ticket_id])
    if not existing:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    dept = scope_department(admin)
    if dept is not None and dept != existing[0]["to_department_id"]:
        raise HTTPException(status_code=403, detail="Only the receiving department can respond to this ticket.")
    if existing[0]["status"] != "Open":
        raise HTTPException(status_code=400, detail="This ticket has already been decided.")

    query(
        "update tickets set status = %s, response_notes = coalesce(%s, response_notes), updated_at = now() where id = %s",
        [body.status, body.response_notes, ticket_id],
    )
    updated = query(TICKET_SELECT + " where t.id = %s", [ticket_id])
    return updated[0]


@router.put("/{ticket_id}/status")
def update_ticket_status(ticket_id: int, body: TicketStatusBody, admin: dict = Depends(require_admin)):
    """
    Once Accepted, the RECEIVING department's admin moves the ticket
    straight to In Progress or Completed themselves — no assigning it to
    one of their users first. Completed emails the original raiser.
    """
    if body.status not in ("In Progress", "Completed"):
        raise HTTPException(status_code=400, detail="Status must be 'In Progress' or 'Completed'.")

    ticket = query("select to_department_id, status, raised_by, title from tickets where id = %s", [ticket_id])
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    ticket = ticket[0]

    dept = scope_department(admin)
    if dept is not None and dept != ticket["to_department_id"]:
        raise HTTPException(status_code=403, detail="Only the receiving department can update this ticket.")
    if ticket["status"] not in ("Accepted", "In Progress"):
        raise HTTPException(status_code=400, detail="Accept this ticket before working on it.")

    query("update tickets set status = %s, updated_at = now() where id = %s", [body.status, ticket_id])

    if body.status == "Completed":
        raiser = query("select full_name, email from users where id = %s", [ticket["raised_by"]])
        if raiser:
            send_email(
                raiser[0]["email"],
                f"Your ticket has been resolved: {ticket['title']}",
                f"Hi {raiser[0]['full_name']},\n\n"
                f"Your ticket \"{ticket['title']}\" has been resolved and is now closed.\n\n— Ibotix PM",
            )

    updated = query(TICKET_SELECT + " where t.id = %s", [ticket_id])
    return updated[0]
