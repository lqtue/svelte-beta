-- Per-map open counter.
--
-- Why this exists: /explore is a single route that mounts every map in-place, so
-- Cloudflare Web Analytics only ever reports "/explore" — its RUM schema has a
-- requestPath dimension and no query-string dimension, so the ?map= param added
-- alongside this migration is invisible to it. Without this table there is no way
-- to tell which of the ~100 maps anyone actually opens.
--
-- Deliberately NOT a session/event log: no user_id, no IP, no user agent, no
-- referrer. One row per map open is enough to rank maps by interest, and keeping
-- viewer identity out means there is no viewing history to leak or to have to
-- protect. Add a session dimension only if a question actually needs it.

create table if not exists public.map_opens (
  id         uuid primary key default gen_random_uuid(),
  map_id     uuid not null references public.maps(id) on delete cascade,
  created_at timestamptz default now()
);

comment on table public.map_opens is
  'Append-only tally of map opens from /explore. One row per open, intentionally '
  'anonymous — no user_id/IP/UA. Written by the anon key from the client; read by '
  'admin/mod only.';

-- Aggregation is always "count per map", optionally windowed by date.
create index if not exists idx_map_opens_map_id_created_at
  on public.map_opens (map_id, created_at desc);

alter table public.map_opens enable row level security;

-- Anyone browsing the archive can record an open — the client holds only the
-- anon key, and opens happen before/without sign-in. Insert-only: no select,
-- update or delete is granted to anon, so the table cannot be read back or
-- tampered with through the public key.
drop policy if exists map_opens_insert_public on public.map_opens;
create policy map_opens_insert_public on public.map_opens
  for insert to anon, authenticated
  with check (true);

-- Reading the tally is staff-only. profiles.role is 'admin' | 'mod' | null.
drop policy if exists map_opens_select_staff on public.map_opens;
create policy map_opens_select_staff on public.map_opens
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'mod')
    )
  );
