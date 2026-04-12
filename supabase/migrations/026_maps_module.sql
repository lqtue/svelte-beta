-- ============================================================
-- Migration 026 — Maps module redesign
-- Adds source tracking, IIIF metadata, classification tags,
-- geographic coverage, and lifecycle status to the maps table.
-- ============================================================

-- Source type: where the map image lives
alter table public.maps
  add column if not exists source_type text
    check (source_type in ('ia', 'bnf', 'efeo', 'gallica', 'rumsey', 'self', 'other'));

-- IIIF URLs
alter table public.maps
  add column if not exists iiif_manifest text,   -- URL to IIIF manifest JSON (v2 or v3)
  add column if not exists iiif_image    text;   -- URL to IIIF image service (base, no /info.json)

-- Internet Archive identifier (ia source only)
alter table public.maps
  add column if not exists ia_identifier text;   -- e.g. "vma-map-<uuid>"

-- Metadata harvested from IIIF manifest or entered manually
alter table public.maps
  add column if not exists original_title text,  -- title as it appears on the map / in the source
  add column if not exists creator        text,  -- cartographer / publisher
  add column if not exists year_label     text,  -- display string e.g. "c. 1882", "1898–1902"
  add column if not exists language       text,  -- ISO 639-1, e.g. "fr", "vi"
  add column if not exists rights         text,  -- rights statement or license from source
  add column if not exists source_url     text;  -- canonical URL at source institution

-- Classification tags
alter table public.maps
  add column if not exists collection text,  -- institutional collection, e.g. "BnF Gallica", "EFEO"
  add column if not exists map_type   text;  -- e.g. "cadastral", "topographic", "city_plan", "panorama"

-- Geographic coverage (WGS84 bounding box)
-- [west, south, east, north]
alter table public.maps
  add column if not exists bbox float8[];

-- Lifecycle status
alter table public.maps
  add column if not exists status text default 'pending_georef'
    check (status in ('pending_georef', 'georeferenced', 'processing', 'published'));

-- Updated-at timestamp (for cache invalidation)
alter table public.maps
  add column if not exists updated_at timestamptz default now();

-- Index for common filter queries
create index if not exists idx_maps_status      on public.maps (status);
create index if not exists idx_maps_source_type on public.maps (source_type);
create index if not exists idx_maps_map_type    on public.maps (map_type);
create index if not exists idx_maps_collection  on public.maps (collection);

-- Auto-update updated_at on row change
create or replace function public.maps_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger maps_updated_at
  before update on public.maps
  for each row execute function public.maps_set_updated_at();

-- Backfill existing rows: source_type = 'ia' where ia_identifier-style
-- allmaps_id is present (heuristic: all current maps were uploaded to IA)
update public.maps
  set source_type = 'ia',
      status      = 'published'
  where source_type is null;
