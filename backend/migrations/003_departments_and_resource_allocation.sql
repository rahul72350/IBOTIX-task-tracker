-- =========================================================
-- IBOTIX PM — MIGRATION: department customization (BA/RPA/Data Science),
-- resource allocation, and Jira-style sprint fields
-- Run against your EXISTING database:
--   psql -U postgres -d ibotix_tm -f backend/migrations/003_departments_and_resource_allocation.sql
-- Safe to re-run — every statement is guarded with IF NOT EXISTS.
-- =========================================================

-- Project category (Product vs. Delivery/Client) — matches the Project
-- Master sheet. Existing projects default to 'Delivery'; change any that
-- are actually internal products via Projects → Edit, or directly:
--   update projects set category = 'Product' where name in (...);
alter table projects add column if not exists category text not null default 'Delivery'
  check (category in ('Product','Delivery'));

-- Feature-tracking fields on processes (optional everywhere; the UI only
-- shows them for BA / Data Science departments) and Jira-style points.
alter table processes add column if not exists feature_code text;
alter table processes add column if not exists monthly_target int;
alter table processes add column if not exists story_points int;

-- Resource allocation — a person's % capacity split across projects,
-- independent of Assignments.
create table if not exists resource_allocations (
  id             serial primary key,
  user_id        int not null references users(id) on delete cascade,
  project_id     int not null references projects(id) on delete cascade,
  allocation_pct numeric(5,2) not null check (allocation_pct >= 0 and allocation_pct <= 100),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, project_id)
);
create index if not exists idx_resource_alloc_user    on resource_allocations(user_id);
create index if not exists idx_resource_alloc_project on resource_allocations(project_id);

-- ---------------------------------------------------------------------
-- Optional: rename your existing departments to the 3 now supported with
-- dedicated UI (BA Team / RPA Team / Data Science Team). This is DATA,
-- not schema, so it's commented out — uncomment and adjust the names on
-- the left to match what's actually in your `departments` table
-- (check with: select id, name from departments;) before running.
-- ---------------------------------------------------------------------
-- update departments set name = 'BA Team'           where name = 'Presales BA';
-- update departments set name = 'Data Science Team' where name = 'Postsales BA';
-- update departments set name = 'RPA Team'          where name = 'Development';
