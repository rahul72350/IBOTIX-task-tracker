-- =========================================================
-- IBOTIX PM — MIGRATION: Sprints v2 (RPA/DS only, auto-forward)
-- Run against your EXISTING database:
--   psql -U postgres -d ibotix_tm -f backend/migrations/006_sprints_v2_and_readonly_super_admin.sql
-- Safe to re-run. Note: this only adds the sprints table/column — the
-- "super admin is view-only" change is enforced entirely in code
-- (backend routers + frontend), there's nothing to migrate for it.
-- =========================================================

create table if not exists sprints (
  id          serial primary key,
  project_id  int not null references projects(id) on delete cascade,
  name        text not null,
  goal        text,
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'Planned' check (status in ('Planned','Active','Completed')),
  created_at  timestamptz not null default now()
);

alter table processes add column if not exists sprint_id int references sprints(id) on delete set null;

create index if not exists idx_processes_sprint on processes(sprint_id);
create index if not exists idx_sprints_project  on sprints(project_id);
