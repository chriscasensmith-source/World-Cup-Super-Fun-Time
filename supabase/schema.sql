-- World Cup Super Fun Time — Supabase schema
-- ---------------------------------------------------------------------------
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
-- It creates a single shared "draft" row that every phone reads, updates, and
-- subscribes to in real time.

create table if not exists public.draft (
  id          integer primary key default 1,
  draft_order jsonb       not null default '[]'::jsonb,
  picks       jsonb       not null default '[]'::jsonb,
  locked      boolean     not null default false,
  locked_at   timestamptz,
  version     integer     not null default 0,
  updated_at  timestamptz not null default now(),
  constraint draft_singleton check (id = 1)
);

-- Seed the singleton row.
insert into public.draft (id) values (1) on conflict (id) do nothing;

-- Row Level Security: anyone holding the public anon key may read & edit the
-- single draft row. This is appropriate for a friendly 3-person draft; the
-- final published result is protected separately via public/data/draft-lock.json.
-- To tighten later, replace `using (true)` with a check on a shared secret.
alter table public.draft enable row level security;

drop policy if exists "wcsft read draft"   on public.draft;
drop policy if exists "wcsft insert draft" on public.draft;
drop policy if exists "wcsft update draft" on public.draft;

create policy "wcsft read draft"   on public.draft for select using (true);
create policy "wcsft insert draft" on public.draft for insert with check (true);
create policy "wcsft update draft" on public.draft for update using (true) with check (true);

-- Enable Realtime so picks broadcast to every connected phone.
alter publication supabase_realtime add table public.draft;
