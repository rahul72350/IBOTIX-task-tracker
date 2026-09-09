-- =========================================================
-- IBOTIX PM — MIGRATION: file attachments + deadline emails
-- Run against your EXISTING database (do NOT run schema.sql, which
-- drops everything):
--   psql -U postgres -d ibotix_tm -f backend/migrations/002_attachments_and_deadlines.sql
-- Safe to re-run — every statement is guarded with IF NOT EXISTS.
-- =========================================================

alter table processes add column if not exists due_date date;
alter table processes add column if not exists deadline_notified boolean not null default false;

alter table sprints add column if not exists deadline_notified boolean not null default false;

alter table task_updates add column if not exists attachment_file_name text;
alter table task_updates add column if not exists attachment_url text;
alter table task_updates add column if not exists attachment_size_kb int;
alter table task_updates add column if not exists attachment_type text;
