-- ============================================================
-- Migration 037 — user_favorites.map_id: text → uuid FK
-- Per db-guidelines.md: all FK columns must reference the PK UUID.
--
-- Existing rows store maps.allmaps_id (hex string).
-- We backfill via maps.allmaps_id lookup, delete unresolvable rows,
-- then convert the column to uuid with a proper FK.
-- ============================================================

-- Step 1: Add a staging UUID column
alter table public.user_favorites
  add column if not exists map_uuid uuid;

-- Step 2: Resolve text allmaps_id → maps.id UUID
update public.user_favorites uv
  set map_uuid = m.id
  from public.maps m
  where m.allmaps_id = uv.map_id;

-- Step 3: Delete rows that couldn't be resolved (orphaned favorites)
delete from public.user_favorites
  where map_uuid is null;

-- Step 4: Drop old text column, rename, add FK and NOT NULL
alter table public.user_favorites
  drop column map_id;

alter table public.user_favorites
  rename column map_uuid to map_id;

alter table public.user_favorites
  alter column map_id set not null;

alter table public.user_favorites
  add constraint user_favorites_map_id_fkey
    foreign key (map_id) references public.maps(id) on delete cascade;

-- Step 5: Recreate unique constraint (was on text column, now on uuid)
alter table public.user_favorites
  add constraint user_favorites_user_id_map_id_key
    unique (user_id, map_id);

-- Recreate index
drop index if exists idx_user_favorites_user;
create index idx_user_favorites_user on public.user_favorites(user_id);
