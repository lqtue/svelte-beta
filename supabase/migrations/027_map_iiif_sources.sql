-- ============================================================
-- Migration 027 — map_iiif_sources + data integrity fixes
--
-- 1. Create map_iiif_sources table (1:many IIIF per map)
-- 2. Migrate existing iiif_image/iiif_manifest → primary source row
-- 3. Trigger to keep maps.iiif_image/iiif_manifest in sync
-- 4. Drop stale allmaps_id from label_tasks + footprint_submissions
-- 5. Fix annotation_sets.map_id (loose string → nullable FK)
-- ============================================================


-- ---- 1. map_iiif_sources ----

create table if not exists public.map_iiif_sources (
  id            uuid primary key default gen_random_uuid(),
  map_id        uuid not null references public.maps(id) on delete cascade,
  label         text,                  -- display name, e.g. "BnF Gallica", "Internet Archive"
  source_type   text
    check (source_type in ('ia', 'bnf', 'efeo', 'gallica', 'rumsey', 'self', 'other')),
  iiif_manifest text,                  -- manifest URL (v2 or v3)
  iiif_image    text not null,         -- image service base URL
  is_primary    boolean not null default false,
  sort_order    integer not null default 0,  -- fallback priority (lower = tried first)
  created_at    timestamptz default now()
);

-- Only one primary source per map
create unique index if not exists map_iiif_sources_one_primary
  on public.map_iiif_sources (map_id)
  where is_primary = true;

create index if not exists idx_map_iiif_sources_map_id
  on public.map_iiif_sources (map_id);

alter table public.map_iiif_sources enable row level security;

-- Public can read sources (needed to render maps)
create policy "map_iiif_sources_select_all"
  on public.map_iiif_sources for select
  using (true);

-- Admin-only writes
create policy "map_iiif_sources_insert_admin"
  on public.map_iiif_sources for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "map_iiif_sources_update_admin"
  on public.map_iiif_sources for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "map_iiif_sources_delete_admin"
  on public.map_iiif_sources for delete
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );


-- ---- 2. Migrate existing iiif_image → primary source row ----

insert into public.map_iiif_sources (map_id, label, source_type, iiif_manifest, iiif_image, is_primary, sort_order)
select
  id,
  case source_type
    when 'ia'      then 'Internet Archive'
    when 'bnf'     then 'BnF Gallica'
    when 'efeo'    then 'EFEO'
    when 'gallica' then 'Gallica'
    when 'rumsey'  then 'David Rumsey'
    else 'Primary'
  end,
  source_type,
  iiif_manifest,
  iiif_image,
  true,
  0
from public.maps
where iiif_image is not null;


-- ---- 3. Trigger: keep maps.iiif_image / iiif_manifest in sync ----

create or replace function public.sync_primary_iiif_to_map()
returns trigger language plpgsql as $$
begin
  -- When a source is marked primary, update the parent map cache
  if new.is_primary = true then
    update public.maps
      set iiif_image    = new.iiif_image,
          iiif_manifest = new.iiif_manifest
      where id = new.map_id;

    -- Demote any other primary source for this map
    update public.map_iiif_sources
      set is_primary = false
      where map_id = new.map_id
        and id <> new.id
        and is_primary = true;
  end if;
  return new;
end;
$$;

create or replace trigger map_iiif_sources_sync_primary
  after insert or update of is_primary on public.map_iiif_sources
  for each row execute function public.sync_primary_iiif_to_map();


-- ---- 4. Drop stale allmaps_id from label_tasks + footprint_submissions ----
-- These columns were denormalized copies that drifted out of sync with maps.allmaps_id.
-- Code should join: label_tasks.map_id → maps.id → maps.allmaps_id instead.

alter table public.label_tasks
  drop column if exists allmaps_id;

alter table public.footprint_submissions
  drop column if exists allmaps_id;


-- ---- 5. Fix annotation_sets.map_id (loose string → nullable FK) ----
-- Current state: map_id is text NOT NULL, stores "" for unlinked sets.
-- Steps: drop NOT NULL, convert "" → NULL, change type to uuid, add FK.

alter table public.annotation_sets
  alter column map_id drop not null;

update public.annotation_sets
  set map_id = null
  where map_id = '' or map_id is null;

alter table public.annotation_sets
  alter column map_id type uuid using (nullif(map_id, '')::uuid),
  add constraint annotation_sets_map_id_fk
    foreign key (map_id) references public.maps(id) on delete set null;
