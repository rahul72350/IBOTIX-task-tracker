-- =========================================================
-- IBOTIX PM — MIGRATION: HR Ops Team department
-- Run against your EXISTING database:
--   psql -U postgres -d ibotix_tm -f backend/migrations/007_hr_ops_and_admin_features.sql
-- Safe to re-run — every insert is guarded against duplicates.
-- =========================================================

insert into departments (name, sort_order)
  select 'HR Ops Team', coalesce((select max(sort_order) from departments), 0) + 1
  where not exists (select 1 from departments where name = 'HR Ops Team');

insert into designations (name, department_id)
  select 'HR Ops Associate', (select id from departments where name = 'HR Ops Team')
  where not exists (select 1 from designations where name = 'HR Ops Associate');

insert into designations (name, department_id)
  select 'Senior HR Ops Associate', (select id from departments where name = 'HR Ops Team')
  where not exists (select 1 from designations where name = 'Senior HR Ops Associate');

-- No schema changes are needed for the Admin/User view toggle or the
-- Super Admin's narrow "create a department's first admin" exception —
-- both are enforced in application code (frontend + backend routers),
-- not new columns or tables.
