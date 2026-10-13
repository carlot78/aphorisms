-- Aphorisms — shared ratings database.
-- Run once in the Supabase SQL editor (Project → SQL Editor → New query).
--
-- Design: the anon (public) key can only
--   * call cast_vote / clear_vote, which validate input and upsert one row
--     per (device, quote), and
--   * read the aggregate view quote_scores.
-- The votes table itself is not readable or writable by the public.

create table if not exists public.votes (
  device_id  uuid        not null,
  quote_id   text        not null check (quote_id ~ '^[0-9a-f]{8}$'),
  source_id  text        check (source_id is null or length(source_id) <= 80),
  vote       smallint    not null check (vote between -1 and 1),
  updated_at timestamptz not null default now(),
  primary key (device_id, quote_id)
);

alter table public.votes enable row level security;
-- No policies: direct access is denied to anon/authenticated.
revoke all on public.votes from anon, authenticated;

create or replace function public.cast_vote(p_device uuid, p_quote text, p_source text, p_vote int)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.votes (device_id, quote_id, source_id, vote)
  values (p_device, p_quote, left(p_source, 80), p_vote::smallint)
  on conflict (device_id, quote_id)
  do update set vote = excluded.vote, source_id = excluded.source_id, updated_at = now();
$$;

create or replace function public.clear_vote(p_device uuid, p_quote text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.votes where device_id = p_device and quote_id = p_quote;
$$;

create or replace view public.quote_scores as
  select quote_id,
         count(*) filter (where vote = 1)::int  as up,
         count(*) filter (where vote = 0)::int  as meh,
         count(*) filter (where vote = -1)::int as down
  from public.votes
  group by quote_id;

revoke all on public.quote_scores from anon, authenticated;
grant select on public.quote_scores to anon, authenticated;
grant execute on function public.cast_vote(uuid, text, text, int) to anon, authenticated;
grant execute on function public.clear_vote(uuid, text) to anon, authenticated;
