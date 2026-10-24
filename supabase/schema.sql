-- 拍拍星航 PaPa Star Beat · Supabase schema
-- Run once in Supabase → SQL Editor. Creates community levels + leaderboards with row-level security:
-- anyone can read; anyone can insert (with size/range checks); nobody can edit or delete through the anon key.

create extension if not exists pgcrypto;

create table if not exists public.levels (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 40),
  author      text not null default '' check (char_length(author) <= 24),
  description text not null default '' check (char_length(description) <= 120),
  bpm         real not null check (bpm between 60 and 220),
  data        jsonb not null check (pg_column_size(data) < 200000),
  plays       integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  level_id   text not null check (char_length(level_id) between 1 and 64),
  diff       text not null check (diff in ('easy', 'normal', 'hard')),
  name       text not null check (char_length(name) between 1 and 16),
  score      integer not null check (score between 0 and 10000000),
  acc        real not null check (acc between 0 and 1),
  rank       text not null check (rank in ('S', 'A', 'B', 'C', 'F')),
  max_combo  integer not null default 0 check (max_combo between 0 and 100000),
  created_at timestamptz not null default now()
);
create index if not exists scores_board on public.scores (level_id, diff, score desc);
create index if not exists levels_new on public.levels (created_at desc);
create index if not exists levels_hot on public.levels (plays desc);

alter table public.levels enable row level security;
alter table public.scores enable row level security;

drop policy if exists "levels readable" on public.levels;
drop policy if exists "levels uploadable" on public.levels;
drop policy if exists "scores readable" on public.scores;
drop policy if exists "scores submittable" on public.scores;
create policy "levels readable"   on public.levels for select using (true);
create policy "levels uploadable" on public.levels for insert with check (plays = 0);
create policy "scores readable"   on public.scores for select using (true);
create policy "scores submittable" on public.scores for insert with check (true);

-- play counter without granting UPDATE on the table
create or replace function public.add_play(lid uuid) returns void
language sql security definer set search_path = public as $$
  update public.levels set plays = plays + 1 where id = lid;
$$;
revoke all on function public.add_play(uuid) from public;
grant execute on function public.add_play(uuid) to anon, authenticated;
