-- Migration 064 — stop enqueueing hosting jobs that cannot do anything
--
-- 058's two conditions were right for the maps that existed then, and wrong for
-- the archive as it is now:
--
--   * `mirror_annotation` fires whenever `annotation_url is null`, but a map
--     that has never been georeferenced has nothing to mirror. All 62 drafts
--     carry an `allmaps_id` and 404 on annotations.allmaps.org, so publishing
--     them would queue 62 jobs that can only fail. `georef_done` is the flag
--     that says an annotation exists upstream.
--
--   * `tile_to_r2` fires unless `source_type = 'r2'`, but `source_type` records
--     *provenance* — where a map came from — while the question being asked is
--     *where its tiles are served from*. Every one of the 101 maps already
--     answers `iiif.maparchive.vn` with a 200 info.json, including the 62 still
--     labelled `self`. Asking the URL instead of the provenance column keeps the
--     provenance intact and stops 62 redundant re-tiling runs.
--
-- Both conditions only ever suppress work that would fail or repeat, so a map
-- that genuinely needs either job still gets it.

create or replace function public.enqueue_publish_jobs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status not in ('public', 'featured') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = new.status then
    return new;  -- an edit to an already-public map is not a publish
  end if;

  -- Our own copy of the georeference, so the viewer never calls allmaps.org.
  -- Only when there is one to copy.
  if new.annotation_url is null and new.allmaps_id is not null and new.georef_done then
    insert into public.pipeline_jobs (kind, map_id, payload)
    values ('mirror_annotation', new.id, jsonb_build_object('allmaps_id', new.allmaps_id))
    on conflict do nothing;
  end if;

  -- Our own tiles, unless they are already served from our own host.
  if new.iiif_image is not null
     and new.iiif_image not like 'https://iiif.maparchive.vn/%'
  then
    insert into public.pipeline_jobs (kind, map_id, payload)
    values ('tile_to_r2', new.id, jsonb_build_object('iiif_image', new.iiif_image))
    on conflict do nothing;
  end if;

  return new;
end;
$$;
