-- =========================================================
-- IBOTIX PM — MIGRATION: 3-tier roles + department isolation + remove Sprints
-- Run against your EXISTING database:
--   psql -U postgres -d ibotix_tm -f backend/migrations/004_roles_and_isolation.sql
--
-- This is a bigger structural change than earlier migrations (new required
-- columns, a new role model). It does its best to carry your existing data
-- forward, but for a dev/test database you're not attached to, it's
-- genuinely simpler to drop and re-run schema.sql fresh instead. Read
-- through this file before running it on anything you care about.
-- =========================================================

-- 1) Users: add department_id, backfill from their designation's
--    department, widen the role check to the new 3-tier model. Existing
--    'admin' users become 'super_admin' (unrestricted) — demote the ones
--    that should really be department_admin afterward from the Users screen.
alter table users add column if not exists department_id int references departments(id) on delete set null;

update users u set department_id = d.id
  from designations des join departments d on d.id = des.department_id
 where u.designation_id = des.id and u.department_id is null;

alter table users drop constraint if exists users_role_check;
update users set role = 'super_admin' where role = 'admin';
alter table users add constraint users_role_check check (role in ('super_admin','department_admin','user'));

-- Any user still without a department (shouldn't normally happen) needs
-- one assigned manually before the constraint below will pass:
--   update users set department_id = <id> where id = <user with no department>;
alter table users drop constraint if exists chk_admin_has_department;
alter table users add constraint chk_admin_has_department check (
  (role = 'super_admin') or (department_id is not null)
);

-- 2) Projects: add department_id. A project used to be able to span
--    several departments via its processes; pick the department with the
--    most processes on each project as its new single owner. Projects
--    with no processes yet default to the first department — reassign
--    those manually afterward if that's wrong.
alter table projects add column if not exists department_id int references departments(id);

update projects p set department_id = sub.department_id
  from (
    select distinct on (pr.project_id) pr.project_id, pr.department_id
      from processes pr
     where pr.department_id is not null
     group by pr.project_id, pr.department_id
     order by pr.project_id, count(*) desc
  ) sub
 where p.id = sub.project_id and p.department_id is null;

update projects set department_id = (select id from departments order by id limit 1)
 where department_id is null;

alter table projects alter column department_id set not null;

-- Processes' own department_id must now match their project's — fixes any
-- that drifted from the multi-department days.
update processes pr set department_id = p.department_id
  from projects p where pr.project_id = p.id and pr.department_id is distinct from p.department_id;
alter table processes alter column department_id set not null;

-- 3) Remove Sprints entirely.
alter table processes drop column if exists sprint_id;
alter table processes drop column if exists story_points;
drop table if exists sprints cascade;

-- 4) Tickets: from_department_id becomes required (it always should have
--    been the raiser's own department).
update tickets set from_department_id = (
  select department_id from users where id = tickets.raised_by
) where from_department_id is null;
alter table tickets alter column from_department_id set not null;
