-- Migration 041 — add 'r2' to source_type check constraints
-- Both maps.source_type and map_iiif_sources.source_type were missing 'r2',
-- causing mirror-r2 inserts to fail with a constraint violation.

alter table public.maps
  drop constraint if exists maps_source_type_check;

alter table public.maps
  add constraint maps_source_type_check
  check (source_type in ('ia', 'bnf', 'efeo', 'gallica', 'rumsey', 'self', 'r2', 'other'));

alter table public.map_iiif_sources
  drop constraint if exists map_iiif_sources_source_type_check;

alter table public.map_iiif_sources
  add constraint map_iiif_sources_source_type_check
  check (source_type in ('ia', 'bnf', 'efeo', 'gallica', 'rumsey', 'self', 'r2', 'other'));
