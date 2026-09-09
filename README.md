# Ibotix PM — FastAPI Edition (v9: Multi-Department Rebuild)

Your Ibotix PM app on **React + Python (FastAPI) + PostgreSQL + Swagger**.
This is the largest single rebuild yet — six real departments, projects
that can be shared across departments instead of duplicated, a proper
ticket approval chain, OTP-based auth throughout, and a dedicated
simplified workflow for HR. Read the "Judgment calls" section below —
a few of these requirements needed a specific interpretation to stay
unambiguous, and it's worth knowing what I decided.

- **Frontend:** React + Vite (`frontend/`)
- **Backend:** FastAPI (`backend/`) — Swagger docs at `/docs`
- **Database:** PostgreSQL
- **Auth:** JWT + bcrypt + OTP

---

## Departments (seeded, real ones this time)

| Department | Workflow |
|---|---|
| Pre Sales BA | Standard |
| Post Sales BA | Standard |
| RPA | Standard + Sprints |
| Data Science | Standard + Sprints + Team Capacity |
| HR OPS TEAM | Simplified header + task |
| HR OPS | Simplified header + task |

Pre Sales BA and Post Sales BA are **fully separate departments** —
different projects, users, tickets, everything. Same for HR OPS and HR
OPS TEAM, which are also fully separate from each other despite sharing
the same simplified workflow style.

---

## Accounts — exactly these seven, nothing else

`python -m app.seed` creates **only** these accounts. No demo projects,
processes, tickets, or task types are seeded — you build everything else
yourself from a clean slate.

| Role | Email | Password |
|---|---|---|
| Super Admin | neeraj@ibotix.ai | Neeraj@123 |
| Post Sales BA Admin | suyash@ibotix.ai | Suyash@123 |
| Pre Sales BA Admin | ujjwal@ibotix.ai | Ujjwal@123 |
| RPA Admin | gourav@ibotix.ai | Gourav@123 |
| Data Science Admin | bhumika@ibotix.ai | Bhumika@123 |
| HR OPS TEAM Admin | pratigya@ibotix.ai | Pratigya@123 |
| HR OPS Admin | shrishti@ibotix.ai | Shrishti@123 |

All seven are pre-verified and pre-approved — they sign in immediately,
no OTP or approval step needed for these specific accounts.

---

## What's new — feature by feature

### 1. Project ID + Find Project (no more duplicate projects)

Every project's existing database ID **is** its Project ID — nothing new
to generate or track separately. In Projects, click **Find Project**,
enter an ID, and if it exists you'll see its name, client, and owning
department. If your department isn't already linked, **Link to my
department** adds it — from then on your department can add its own
processes under that same project, and everyone linked sees the same
process list together. Tested live end-to-end: RPA linked to a project
Pre Sales BA created, added their own process, and Pre Sales BA
immediately saw it — that's what keeps BA and dev teams synchronized
(item 2 in your list) without a separate sync mechanism.

A linked department can add processes but can't rename or delete the
project itself — that stays with whoever owns it.

### 2. BA ↔ Developer synchronization

Handled entirely by #1 above — once departments share a project via
linking, they're reading and writing the same rows, not copies. There's
no separate "sync" step because there's nothing to keep in sync.

### 3. Overdue notification (distinct from "coming due soon")

A second, separate email now fires once a process's due date has
**already passed** and it's still not Completed — clearly labeled
OVERDUE, includes the assigned user's name, one email per department
admin. This runs alongside (not instead of) the existing "due within N
days" warning. Trigger it manually for testing:
```bash
curl -X POST http://localhost:8000/api/notifications/check-overdue -H "Authorization: Bearer <token>"
```

### 4. Ticketing — full approval chain, tested live end-to-end

```
Anyone raises a ticket → Receiving dept's admin Accepts/Rejects
  → if Accepted → same admin assigns it to one of their own users
  → that user marks it Resolved → email to the raiser → shows Closed
```
- Any general user can now raise a ticket, not just admins.
- Description is always shown in the ticket list/table — never hidden
  behind a click.
- Verified live: a non-assignee trying to resolve someone else's ticket
  is rejected; the full chain (raise → accept → assign → resolve →
  status flips to Closed) works end to end.

**Judgment call:** your workflow names a "Department Head" who
accepts/rejects and a separate "Department Admin" who assigns. Since the
seed list only defines one admin per department, I treated these as the
same account — your department admin does both steps. If you want a
genuinely separate Department Head role/account later, that's a
moderate addition (a new role value plus its own approval step) — just
ask.

### 5. Pending Process Count — redefined

Now counts only processes that are **assigned AND not yet Completed** —
an unassigned process never counts as pending, matching your example
(10 total, 3 unassigned, 4 completed, 3 assigned-incomplete → Pending = 3).

### 6. Task Status Distribution filter

Department admins now filter this chart by **Select Project**; the
Super Admin still filters by **Select Department** (their dashboard
doesn't have one specific project to narrow to the way a department
admin's does).

### 7. "Task Log — All Time" chart

Searched the whole codebase — no chart under this name exists in this
build (Reports currently shows task tables and status charts, not a
dedicated all-time task log chart). Nothing was removed because there
was nothing matching. If you're thinking of a specific chart from
elsewhere, point me to it and I'll take it out.

### 8, 9, 10. HR OPS and HR OPS TEAM — separate departments, header+task workflow, Assign Again

Two fully separate departments, both using a simplified workflow:
- **Header** = a project, just relabeled in HR's nav ("Headers" instead
  of "Projects") and description.
- **Add Process** for HR shows only **Task Name + Select User + Assign**
  — no Task Type field, no Status picker (defaults to Not Started).
  Verified live.
- **Assign Again**: `POST /api/processes/{id}/assign-again` clones the
  task fresh with a new (or the same) assignee — the original stays
  exactly as it was for history, linked via `repeated_from`. Verified
  live: cloned "Check Employee Attendance" to a new task row pointing
  back at the original.

### 11. Blockers — removed completely

Table dropped, backend router deleted, frontend pages and nav removed.

### 12. Users tab — removed, replaced with Approvals

No more admin-driven "create a user" screen — general users create
their own accounts via **Register**. What's left for a super admin to
actually *do* is reviewing pending admin-tier requests, which now lives
on its own **Approvals** page (not called "Users"). A department admin
managing their own team happens through assignment pickers elsewhere in
the app (Projects, Tickets), which are unaffected — those already pull
live user lists via the API, they never depended on a dedicated tab.

### 13. Pagination groundwork

`GET /api/projects` now accepts `?limit=&offset=`. The other big list
endpoints (processes, tickets, task-updates) are structured the same way
underneath (single indexed queries, no N+1 patterns) so adding the same
`limit`/`offset` params to them later is a small, low-risk change — I
didn't wire up pagination UI everywhere since nothing in a fresh,
un-seeded system has enough rows yet to need it, but the backend won't
need restructuring when that day comes.

### 14. Delete Project — soft delete, tested live

`DELETE /api/projects/{id}` sets `deleted_at` instead of removing the
row. Verified live: the project vanishes from every active list
immediately, while its process and every bit of history stayed exactly
in place in the database. Reports and task history read from
`task_updates` directly and were never filtered by project deletion, so
nothing there changes either.

### 15. Configure — no predefined Task Types

Every department's Task Types list starts **completely empty**. Build
your own from Configure (department admin) or, for the shared master
lists, from Configure as super admin.

### 16. Super Admin as a registration option

"I'm registering as" now includes **Super Admin** — not tied to a
department, requires approval from an existing active super admin (same
Approvals page). Verified live, including the edge case where the
requester has no department (approvals list handles that gracefully).

### 17. Password reset — OTP, not a link

```
Forgot Password → Enter Email → 6-digit code emailed →
Enter code → Verify → Set new password → Done
```
Two backend steps on purpose (`verify-reset-otp` then `reset-password`)
so a code can't be used to set a password without being confirmed
correct first. Verified live: wrong code rejected, resetting before
verifying rejected, reusing a spent code rejected. Codes expire in 10
minutes (`OTP_EXPIRY_MINUTES` in `.env`).

### 18. Email verification on registration — every role

Every new account — user, department admin, or super admin — gets a
6-digit verification code by email and can't sign in until it's
confirmed. This is a **separate gate** from admin approval: a
department-admin request needs both email verified *and* approved
before it can sign in. Verified live for both gates independently.

### 19. Seed data — minimal, exactly as specified

See the Accounts table above. No demo projects, processes, tickets, or
task types.

### 20. Pre Sales BA vs. Post Sales BA — genuinely separate

Confirmed via the same department-isolation mechanism every other
department already used — nothing shared between them except the
option to link projects to each other, same as any two departments.

---

## Setup

```bash
psql -U postgres -c "CREATE DATABASE ibotix_pm;"
psql -U postgres -d ibotix_pm -f backend/schema.sql
cd backend
python -m venv venv
venv\Scripts\activate          # Windows — source venv/bin/activate on Mac/Linux
pip install -r requirements.txt
python -m app.seed
uvicorn app.main:app --reload
```
New terminal:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`.

`.env` already has your Gmail SMTP credentials from earlier rounds — OTP
emails (both password reset and registration verification) use the same
settings, no extra setup needed. New vars this round:
```
OTP_EXPIRY_MINUTES=10
```

### Upgrading an existing database

This round's migration is the biggest structural one yet — it renames
departments, restructures task_types to be department-scoped, and adds
several new tables. For anything but a database you're genuinely
attached to, dropping and re-running `schema.sql` fresh is strongly
recommended. A migration file isn't provided for this round given the
scale of the department rename (Pre Sales BA / Post Sales BA didn't
exist as concepts before) — there's no clean automatic mapping from your
old 4-department structure to the new 6-department one; that decision
needs a human, not a migration script guessing.

---

## Known gaps — read this before assuming something's missing by mistake

- **General users adding processes**: the backend fully supports it
  (`POST /api/processes` works for any role whose department owns or is
  linked to the project). The Projects page UI itself is still
  admin-only-routed in the frontend, so a general user can't reach that
  screen yet to use it directly. This is a real gap, not a design
  choice — happy to open it up next round.
- **"Task Log — All Time" chart**: doesn't exist in this codebase under
  that name — see item 7 above.
- **Pagination**: groundwork only (see item 13) — no paginated UI yet,
  since there's no seed data to paginate through.
- **Department Head vs. Department Admin**: collapsed into one role —
  see item 4's judgment call above.

## Troubleshooting

**CORS errors** — check `CORS_ORIGIN` in `backend/.env` matches your
frontend's actual URL, then fully restart the backend (`--reload`
doesn't pick up `.env` changes).

**Can't log in after registering** — check both gates: email verified?
(check console/inbox for the OTP) — and if you registered as an admin
role, has a super admin approved you yet (Approvals page)?

**OTP email doesn't arrive** — check the backend console; it prints the
email content if SMTP sending fails, so you can always get the code
even if delivery is broken.
