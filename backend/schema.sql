-- =========================================================
-- IBOTIX PM — FASTAPI EDITION SCHEMA (v4)
-- Run once:  psql -U postgres -d ibotix_pm -f backend/schema.sql
--
-- Role hierarchy: super_admin (sees/manages everything, view-only) →
-- department_admin (scoped to their one department — cannot see other
-- departments' data; also acts as the "department head" for ticket
-- accept/reject, see tickets below) → user (their own work, can also
-- raise tickets).
--
-- Departments are NOT hardcoded — six are seeded as real organizations
-- (Pre Sales BA, Post Sales BA, RPA, Data Science, HR OPS TEAM, HR OPS),
-- each fully separate. HR OPS and HR OPS TEAM use a distinct, simpler
-- "header + task" workflow (see processes.repeated_from below) instead
-- of the standard project/process model.
--
-- A project has one OWNING department, but can be LINKED to others via
-- project_links — a linked department can then add its own processes
-- under that same project instead of duplicating it. Use the Project ID
-- (its normal database id) to find and link an existing project.
-- =========================================================

drop table if exists otp_codes cascade;
drop table if exists tickets cascade;
drop table if exists blockers cascade;
drop table if exists resource_allocations cascade;
drop table if exists password_reset_tokens cascade;
drop table if exists task_updates cascade;
drop table if exists assignments cascade;
drop table if exists processes cascade;
drop table if exists sprints cascade;
drop table if exists project_links cascade;
drop table if exists projects cascade;
drop table if exists users cascade;
drop table if exists designations cascade;
drop table if exists task_statuses cascade;
drop table if exists project_statuses cascade;
drop table if exists priorities cascade;
drop table if exists departments cascade;

create extension if not exists "pgcrypto";

-- ---------- MASTER / CONFIGURABLE LISTS ----------
create table departments (
  id          serial primary key,
  name        text not null unique,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  -- HR OPS and HR OPS TEAM use the header+task workflow instead of the
  -- normal project/process model (see the Projects/Processes section).
  is_hr_workflow boolean not null default false
);

create table task_statuses (
  id          serial primary key,
  name        text not null unique,
  is_active   boolean not null default true,
  sort_order  int not null default 0
);

create table project_statuses (
  id          serial primary key,
  name        text not null unique,
  is_active   boolean not null default true,
  sort_order  int not null default 0
);

create table priorities (
  id          serial primary key,
  name        text not null unique,
  is_active   boolean not null default true,
  sort_order  int not null default 0
);

create table designations (
  id            serial primary key,
  name          text not null,
  department_id int references departments(id) on delete set null,
  is_active     boolean not null default true,
  unique (name, department_id)
);

-- ---------- USERS ----------
-- department_id is the security boundary: null only for super_admin.
-- email_verified gates login independently of `status` — a brand-new
-- registration is unverified AND (for admin roles) pending, both must
-- clear before sign-in works.
create table users (
  id             serial primary key,
  full_name      text not null,
  email          text not null unique,
  password_hash  text not null,
  phone          text,
  designation_id int references designations(id) on delete set null,
  department_id  int references departments(id) on delete set null,
  role           text not null default 'user' check (role in ('super_admin','department_admin','user')),
  status         text not null default 'active' check (status in ('active','inactive','pending')),
  email_verified boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint chk_admin_has_department check (
    (role = 'super_admin') or (department_id is not null)
  )
);

-- ---------- PROJECTS ----------
-- Owned by one department, but can be linked to others (project_links)
-- so a shared client engagement isn't duplicated per department. Soft
-- delete only — deleted_at hides it from active lists everywhere, but
-- every process/task/ticket that ever pointed at it stays intact for
-- reporting and audit.
create table projects (
  id            serial primary key,
  name          text not null,
  client_name   text not null,
  category      text not null default 'Delivery' check (category in ('Product','Delivery')),
  department_id int not null references departments(id) on delete cascade,
  start_date    date not null default current_date,
  priority_id   int references priorities(id) on delete set null,
  description   text,
  status_id     int references project_statuses(id) on delete set null,
  created_by    int references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- A department other than the owner that has linked in to collaborate on
-- this project. Once linked, that department can add its own processes
-- under this same project id.
create table project_links (
  id            serial primary key,
  project_id    int not null references projects(id) on delete cascade,
  department_id int not null references departments(id) on delete cascade,
  linked_by     int references users(id) on delete set null,
  linked_at     timestamptz not null default now(),
  unique (project_id, department_id)
);

-- ---------- SPRINTS ----------
-- Only ever created for RPA / Data Science projects — enforced in the
-- API. HR-workflow departments and BA never use sprints.
create table sprints (
  id          serial primary key,
  project_id  int not null references projects(id) on delete cascade,
  name        text not null,
  goal        text,
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'Planned' check (status in ('Planned','Active','Completed')),
  created_at  timestamptz not null default now()
);

-- ---------- PROCESSES ----------
-- department_id is whichever department created THIS process — no longer
-- forced to match the parent project's department, since a project can
-- now be shared across linked departments. For HR-workflow departments,
-- a "process" is a task under a header (the project).
create table processes (
  id            serial primary key,
  project_id    int not null references projects(id) on delete cascade,
  sprint_id     int references sprints(id) on delete set null,
  name          text not null,
  department_id int not null references departments(id) on delete cascade,
  status_id     int references task_statuses(id) on delete set null,
  progress_pct  int not null default 0 check (progress_pct between 0 and 100),
  due_date          date,
  deadline_notified boolean not null default false,  -- "coming due soon" alert, already sent
  overdue_notified  boolean not null default false,  -- "now overdue" alert, already sent
  -- HR OPS / HR OPS TEAM recurring work: when a task like "Check
  -- Employee Attendance" needs doing again, "Assign Again" reuses this
  -- same row's identity by cloning it fresh rather than editing history.
  repeated_from  int references processes(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ---------- ASSIGNMENTS ----------
create table assignments (
  id          serial primary key,
  user_id     int not null references users(id) on delete cascade,
  project_id  int not null references projects(id) on delete cascade,
  process_id  int not null references processes(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (process_id)
);

-- ---------- TASK UPDATES ----------
create table task_updates (
  id             serial primary key,
  user_id        int not null references users(id) on delete cascade,
  project_id     int not null references projects(id) on delete cascade,
  process_id     int not null references processes(id) on delete cascade,
  entry_date     date not null default current_date,
  duration_hours numeric(5,2),
  status_id      int references task_statuses(id) on delete set null,
  remarks        text,
  attachment_file_name text,
  attachment_url        text,
  attachment_size_kb    int,
  attachment_type       text,
  attachment_storage    text default 'local' check (attachment_storage in ('local','r2','s3')),
  created_at     timestamptz not null default now()
);

-- ---------- TICKETS ----------
-- Raised by a department admin to another department. Workflow:
-- Open -> Accepted/Rejected (by the receiving department's admin,
-- acting as department head) -> if Accepted, that same admin moves it
-- to In Progress -> Completed themselves. No per-user assignment step —
-- Completed emails the original raiser.
create table tickets (
  id                 serial primary key,
  title              text not null,
  description        text not null,
  raised_by          int not null references users(id) on delete set null,
  from_department_id int not null references departments(id) on delete cascade,
  to_department_id   int not null references departments(id) on delete cascade,
  priority_id        int references priorities(id) on delete set null,
  status             text not null default 'Open' check (status in ('Open','Accepted','Rejected','In Progress','Completed')),
  response_notes     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------- ADMIN TASKS ----------
-- A super admin's own lightweight directive to a department admin: a
-- title, who it's for, nothing else. Starts In Progress the moment it's
-- created. The only move a department admin has on it is marking it
-- Completed — no reject, no reassigning, no other status.
create table admin_tasks (
  id           serial primary key,
  title        text not null,
  assigned_to  int not null references users(id) on delete cascade,
  created_by   int references users(id) on delete set null,
  status       text not null default 'In Progress' check (status in ('In Progress','Completed')),
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index idx_admin_tasks_assigned_to on admin_tasks(assigned_to);

-- ---------- OTP CODES ----------
-- Shared by both self-service password reset and registration email
-- verification — purpose keeps them from colliding. A code is 6 digits,
-- single-use, short-lived.
create table otp_codes (
  id         serial primary key,
  user_id    int not null references users(id) on delete cascade,
  purpose    text not null check (purpose in ('password_reset','email_verification')),
  code       text not null,
  expires_at timestamptz not null,
  verified   boolean not null default false,  -- password reset: OTP confirmed correct, password step not yet done
  used       boolean not null default false,  -- fully redeemed — can never be used again
  created_at timestamptz not null default now()
);

-- ---------- INDEXES ----------
create index idx_projects_department      on projects(department_id);
create index idx_project_links_project    on project_links(project_id);
create index idx_project_links_department on project_links(department_id);
create index idx_processes_project        on processes(project_id);
create index idx_processes_sprint         on processes(sprint_id);
create index idx_sprints_project          on sprints(project_id);
create index idx_processes_department     on processes(department_id);
create index idx_assignments_user         on assignments(user_id);
create index idx_assignments_project      on assignments(project_id);
create index idx_task_updates_user_date   on task_updates(user_id, entry_date);
create index idx_task_updates_project     on task_updates(project_id);
create index idx_task_updates_entry_date  on task_updates(entry_date);
create index idx_tickets_to_dept          on tickets(to_department_id);
create index idx_tickets_from_dept        on tickets(from_department_id);
create index idx_users_department         on users(department_id);
create index idx_otp_codes_user_purpose   on otp_codes(user_id, purpose);

-- ---------- SEED: DEPARTMENTS ONLY (no business data) ----------
insert into departments (name, sort_order, is_hr_workflow) values
  ('Pre Sales BA', 1, false),
  ('Post Sales BA', 2, false),
  ('RPA', 3, false),
  ('Data Science', 4, false),
  ('HR OPS TEAM', 5, true),
  ('HR OPS', 6, true);

insert into task_statuses (name, sort_order) values
  ('Not Started',1),('In Progress',2),('Completed',3),('On Hold',4),('Pending from Client',5);

insert into project_statuses (name, sort_order) values
  ('Active',1),('On Hold',2),('Completed',3),('Dropped',4);

insert into priorities (name, sort_order) values
  ('Low',1),('Medium',2),('High',3);

insert into designations (name, department_id) values
  ('Department Admin', null);

-- A starter designation per department, so the registration form's
-- Designation dropdown has something to offer from day one. Rename,
-- remove, or add more any time as a super admin via Configure > Designations.
insert into designations (name, department_id)
select title, d.id
  from departments d
  cross join (values ('Associate'), ('Senior Associate'), ('Team Lead')) as t(title);
