-- =========================================================
-- IBOTIX PM — MIGRATION: self-registration, department-scoped task
-- types, and ticket assignment to a user
-- Run against your EXISTING database:
--   psql -U postgres -d ibotix_tm -f backend/migrations/009_registration_dept_tasktypes_ticket_assign.sql
-- Read through the task_types section before running on data you care
-- about — it restructures a previously-global list into per-department
-- copies. Safe to re-run.
-- =========================================================

-- 1) Users: allow a 'pending' status for accounts awaiting super admin
--    approval (self-registered department admin requests).
alter table users drop constraint if exists users_status_check;
alter table users add constraint users_status_check check (status in ('active','inactive','pending'));

-- 2) Task types become department-scoped: each department gets its own
--    independent copy of whatever global list already existed, so
--    nothing you're currently using disappears — it just gets cloned
--    into every department instead of being shared.
alter table task_types add column if not exists department_id int references departments(id) on delete cascade;

do $$
declare
  first_dept int;
  r record;
begin
  if exists (select 1 from task_types where department_id is not null) then
    return; -- already migrated
  end if;

  select id into first_dept from departments order by sort_order, id limit 1;
  if first_dept is null then
    return;
  end if;

  update task_types set department_id = first_dept where department_id is null;

  for r in select id, name, sort_order from task_types where department_id = first_dept loop
    insert into task_types (name, department_id, sort_order)
      select r.name, d.id, r.sort_order
        from departments d
       where d.id <> first_dept
         and not exists (select 1 from task_types tt where tt.department_id = d.id and tt.name = r.name);
  end loop;
end $$;

alter table task_types alter column department_id set not null;
alter table task_types drop constraint if exists task_types_name_key;
alter table task_types drop constraint if exists task_types_name_department_id_key;
alter table task_types add constraint task_types_name_department_id_key unique (name, department_id);

-- 3) Tickets: the raising department's admin can hand a ticket off to one
--    of their own users, who can then mark it Closed themselves.
alter table tickets add column if not exists assigned_to int references users(id) on delete set null;
create index if not exists idx_tickets_assigned_to on tickets(assigned_to);
