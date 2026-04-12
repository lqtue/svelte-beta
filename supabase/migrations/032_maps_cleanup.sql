-- ============================================================
-- Migration 032 — maps table cleanup + flexible metadata
-- ============================================================
-- 1. Rename `type` (misnamed city/location field) → `location`
-- 2. Drop dead `description` column (never rendered anywhere)
-- 3. Backfill `dc_description` from `summary`, then drop `summary`
-- 4. Fix sync trigger to also keep `source_type` current
-- 5. Add `extra_metadata jsonb` for schema-free custom fields


-- ---- 1. Rename type → location ----
alter table public.maps rename column type to location;


-- ---- 2. Drop dead description column ----
alter table public.maps drop column if exists description;


-- ---- 3. Migrate summary → dc_description, drop summary ----
update public.maps
  set dc_description = summary
  where dc_description is null and summary is not null;

alter table public.maps drop column if exists summary;


-- ---- 4. Fix trigger: also sync source_type from primary IIIF source ----
create or replace function public.sync_primary_iiif_to_map()
returns trigger language plpgsql as $$
begin
  if new.is_primary = true then
    update public.maps
      set iiif_image    = new.iiif_image,
          iiif_manifest = new.iiif_manifest,
          source_type   = new.source_type
      where id = new.map_id;

    update public.map_iiif_sources
      set is_primary = false
      where map_id = new.map_id
        and id <> new.id
        and is_primary = true;
  end if;
  return new;
end;
$$;


-- ---- 5. Add flexible JSONB metadata column ----
alter table public.maps
  add column if not exists extra_metadata jsonb default '{}';
