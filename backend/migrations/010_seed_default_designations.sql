-- =========================================================
-- IBOTIX PM — MIGRATION: default designations per department
-- Run against your EXISTING database:
--   psql -U postgres -d ibotix_pm -f backend/migrations/010_seed_default_designations.sql
-- Safe to re-run — every insert is guarded against duplicates.
--
-- 1) `designations.name` was globally unique, left over from before
--    designations became department-scoped (Configure > Designations,
--    /api/auth/register-options both group by department_id already).
--    That blocked two departments from ever sharing a title like "Team
--    Lead". Scope the uniqueness to (name, department_id) instead —
--    same fix migration 009 applied to task_types.
alter table designations drop constraint if exists designations_name_key;
alter table designations add constraint designations_name_department_id_key unique (name, department_id);

-- 2) The registration form's Designation dropdown is populated from
--    this table, scoped by department. Departments started out with
--    none seeded, so the dropdown had nothing to offer. This adds a
--    placeholder set per department — rename, remove, or add more any
--    time as a super admin via Configure > Designations.
insert into designations (name, department_id)
select title, d.id
  from departments d
  cross join (values ('Associate'), ('Senior Associate'), ('Team Lead')) as t(title)
 where not exists (
   select 1 from designations des where des.department_id = d.id and des.name = t.title
 );
