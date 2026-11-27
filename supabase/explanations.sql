-- Aphorisms — shared cache of "What does it mean?" explanations.
-- Run once in the Supabase SQL editor.
--
-- Written only by the `explain` Edge Function (service role). Each quote is
-- explained once per language, then served from here to every reader, so the
-- Claude API cost is bounded by (quotes in the archive) x (languages used).
-- The public key cannot read or write this table directly.

create table if not exists public.explanations (
  quote_id   text not null check (length(quote_id) between 4 and 40),
  lang       text not null check (length(lang) between 2 and 8),
  body       text not null check (length(body) between 1 and 3000),
  model      text not null default '',
  created_at timestamptz not null default now(),
  primary key (quote_id, lang)
);

create index if not exists explanations_created_at on public.explanations (created_at);

alter table public.explanations enable row level security;
revoke all on public.explanations from anon, authenticated;
