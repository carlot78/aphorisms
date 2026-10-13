-- Aphorisms — daily reminder subscriptions.
-- Run once in the Supabase SQL editor, after schema.sql.
--
-- The app (public key) can only save or delete *its own* subscription through
-- the two functions below. Reading the table and marking reminders as sent is
-- done by the daily-push GitHub Action with the project's secret key.

create table if not exists public.push_subscriptions (
  device_id    uuid        primary key,
  endpoint     text        not null unique check (endpoint ~ '^https://' and length(endpoint) < 1000),
  subscription jsonb       not null,
  hour         smallint    not null default 8 check (hour between 0 and 23),
  time_zone    text        not null default 'UTC' check (length(time_zone) <= 64),
  lang         text        not null default '' check (length(lang) <= 10),
  themes       text[]      not null default '{}',
  sources      text[]      not null default '{}',
  last_sent    date,
  updated_at   timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create or replace function public.save_push(
  p_device uuid, p_subscription jsonb, p_hour int, p_time_zone text,
  p_lang text, p_themes text[], p_sources text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_subscription->>'endpoint' is null then
    raise exception 'subscription has no endpoint';
  end if;
  if coalesce(array_length(p_themes, 1), 0) > 50 or coalesce(array_length(p_sources, 1), 0) > 200 then
    raise exception 'too many themes or sources';
  end if;
  -- A browser may re-subscribe under a new device id (e.g. after a reset).
  delete from public.push_subscriptions
   where endpoint = p_subscription->>'endpoint' and device_id <> p_device;
  insert into public.push_subscriptions (device_id, endpoint, subscription, hour, time_zone, lang, themes, sources)
  values (p_device, p_subscription->>'endpoint', p_subscription, p_hour,
          left(coalesce(p_time_zone, 'UTC'), 64), left(coalesce(p_lang, ''), 10),
          coalesce(p_themes, '{}'), coalesce(p_sources, '{}'))
  on conflict (device_id) do update
     set endpoint = excluded.endpoint, subscription = excluded.subscription,
         hour = excluded.hour, time_zone = excluded.time_zone, lang = excluded.lang,
         themes = excluded.themes, sources = excluded.sources, updated_at = now();
end;
$$;

create or replace function public.delete_push(p_device uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where device_id = p_device;
$$;

grant execute on function public.save_push(uuid, jsonb, int, text, text, text[], text[]) to anon, authenticated;
grant execute on function public.delete_push(uuid) to anon, authenticated;
