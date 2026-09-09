-- =========================================================
-- IBOTIX PM — MIGRATION: self-service password reset via email
-- Run against your EXISTING database:
--   psql -U postgres -d ibotix_tm -f backend/migrations/008_password_reset.sql
-- Safe to re-run.
-- =========================================================

create table if not exists password_reset_tokens (
  id         serial primary key,
  user_id    int not null references users(id) on delete cascade,
  token      text not null unique,
  expires_at timestamptz not null,
  used       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_token on password_reset_tokens(token);
