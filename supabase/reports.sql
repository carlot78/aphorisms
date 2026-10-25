-- Aphorisms — problem reports sent from the app ("Report a problem").
-- Run once in the Supabase SQL editor.
--
-- The app (public key) can only *add* a report through submit_report; nobody
-- can read reports with the public key. Read them in Supabase:
--   Table Editor → bug_reports   (newest first: sort by created_at)

create table if not exists public.bug_reports (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  device_id   uuid,
  message     text  not null check (length(message) between 1 and 4000),
  diagnostics jsonb not null default '{}' check (pg_column_size(diagnostics) < 20000),
  status      text  not null default 'new' check (status in ('new', 'seen', 'fixed', 'wontfix'))
);

alter table public.bug_reports enable row level security;
revoke all on public.bug_reports from anon, authenticated;

create or replace function public.submit_report(p_device uuid, p_message text, p_diagnostics jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Gentle limit against accidental floods: 10 reports per device per day.
  if (select count(*) from public.bug_reports
       where device_id = p_device and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too many reports today';
  end if;
  insert into public.bug_reports (device_id, message, diagnostics)
  values (p_device, left(p_message, 4000), coalesce(p_diagnostics, '{}'));
end;
$$;

grant execute on function public.submit_report(uuid, text, jsonb) to anon, authenticated;

-- "Delete my data" in the app also removes this device's reports.
create or replace function public.delete_reports(p_device uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.bug_reports where device_id = p_device;
$$;

grant execute on function public.delete_reports(uuid) to anon, authenticated;
