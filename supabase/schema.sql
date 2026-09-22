-- SPLIT — Supabase schema
-- Run this once in your Supabase project's SQL Editor (Dashboard > SQL Editor > New query).
--
-- Data model: each program/progress/manual-log row is owned by exactly one
-- user (auth.uid()) and RLS enforces that a user can only ever read or write
-- their own rows. The JSON shapes here match the app's in-memory state
-- exactly (phases, sessions, sessionValues, etc.) — this is a thin cloud
-- mirror of the local state, not a normalized relational redesign.
--
-- `shares` is the one deliberately public-read table: it's how "share this
-- program" / "share this week's progress" links work. Anyone who has the
-- exact link (the row's id) can read that one row — nobody can browse or
-- list all shares. This is the same trust model as an unlisted Google Doc
-- link. Only a signed-in user can create a share, and only its creator can
-- delete it.

create table if not exists programs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table programs enable row level security;
drop policy if exists "own programs" on programs;
create policy "own programs" on programs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, program_id)
);
alter table progress enable row level security;
drop policy if exists "own progress" on progress;
create policy "own progress" on progress for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists manual_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table manual_logs enable row level security;
drop policy if exists "own manual logs" on manual_logs;
create policy "own manual logs" on manual_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_program_id text,
  updated_at timestamptz not null default now()
);
alter table user_state enable row level security;
drop policy if exists "own user state" on user_state;
create policy "own user state" on user_state for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists shares (
  id text primary key,
  kind text not null check (kind in ('program','progress')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_by_name text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table shares enable row level security;
drop policy if exists "anyone can read a share by id" on shares;
create policy "anyone can read a share by id" on shares for select
  using (true);
drop policy if exists "signed-in users can create shares" on shares;
create policy "signed-in users can create shares" on shares for insert
  with check (auth.uid() = created_by);
drop policy if exists "creator can delete their share" on shares;
create policy "creator can delete their share" on shares for delete
  using (auth.uid() = created_by);
