-- =========================================================
-- IBOTIX PM — MIGRATION: R2-ready storage + Uploads tab support
-- Run against your EXISTING database:
--   psql -U postgres -d ibotix_tm -f backend/migrations/005_uploads_and_r2.sql
-- Safe to re-run.
-- =========================================================

alter table task_updates add column if not exists attachment_storage text default 'local'
  check (attachment_storage in ('local','r2'));

-- Existing rows were all saved to local disk under the old scheme, so
-- they're already correctly defaulted to 'local' — nothing else to migrate.
