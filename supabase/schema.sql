-- UI Issue Tracker: run this once in Supabase → SQL Editor → New query.
-- Before running, replace the two emails at the bottom with your real ones.

-- People allowed on the board ---------------------------------------------
create table if not exists public.members (
  email        text primary key check (email = lower(email)),
  display_name text not null
);

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Tasks ---------------------------------------------------------------------
create table if not exists public.issues (
  id          uuid primary key default gen_random_uuid(),
  num         bigint generated always as identity,
  title       text not null check (length(trim(title)) > 0),
  description text not null default '',
  assignee    text references public.members(email) on update cascade on delete set null,
  status      text not null default 'todo' check (status in ('todo', 'doing', 'review', 'done')),
  priority    text not null default 'med'  check (priority in ('high', 'med', 'low')),
  links       jsonb not null default '[]'::jsonb,  -- [{ "url": "https://..." }]
  screenshots jsonb not null default '[]'::jsonb,  -- ["<storage path>", ...]
  created_by  text default lower(auth.jwt() ->> 'email'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists issues_touch on public.issues;
create trigger issues_touch before update on public.issues
  for each row execute function public.touch_updated_at();

-- Row level security: only members can read or write ------------------------
alter table public.members enable row level security;
alter table public.issues  enable row level security;

drop policy if exists "members read" on public.members;
create policy "members read" on public.members
  for select to authenticated using (public.is_member());

drop policy if exists "members all" on public.issues;
create policy "members all" on public.issues
  for all to authenticated using (public.is_member()) with check (public.is_member());

-- Live updates ----------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.issues;
exception when duplicate_object then null; end $$;

-- Screenshot storage (private bucket) ---------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 10485760, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "screenshots read"   on storage.objects;
drop policy if exists "screenshots insert" on storage.objects;
drop policy if exists "screenshots delete" on storage.objects;
create policy "screenshots read"   on storage.objects for select to authenticated using (bucket_id = 'screenshots' and public.is_member());
create policy "screenshots insert" on storage.objects for insert to authenticated with check (bucket_id = 'screenshots' and public.is_member());
create policy "screenshots delete" on storage.objects for delete to authenticated using (bucket_id = 'screenshots' and public.is_member());

-- Who is on the board: EDIT THESE TWO LINES ---------------------------------
insert into public.members (email, display_name) values
  ('you@example.com',      'Me'),
  ('designer@example.com', 'Designer')
on conflict (email) do update set display_name = excluded.display_name;
