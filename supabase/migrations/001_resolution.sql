-- Adds a resolution (text + screenshots) recorded when a task is marked done.
-- Run once in Supabase → SQL Editor → New query. Safe to run again.
alter table public.issues
  add column if not exists resolution       text not null default '',
  add column if not exists resolution_shots jsonb not null default '[]'::jsonb,  -- ["<storage path>", ...]
  add column if not exists resolved_by      text,
  add column if not exists resolved_at      timestamptz;
