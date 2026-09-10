-- Migration 080 — mirror the georeference when georeferencing finishes, not only when publishing
--
-- 058 attached enqueue_publish_jobs() to `after insert or update of status`, and
-- returned early when an UPDATE left the status alone ("an edit to an already-public
-- map is not a publish"). 064 then gated the `mirror_annotation` branch on
-- `georef_done`, because a map that has never been georeferenced has nothing to
-- mirror. Each decision was right on its own; together they left a hole.
--
-- The hole: a published map is georeferenced *after* it is published. A volunteer
-- finishes in the Allmaps Editor, `POST /api/admin/maps/sync-georef` probes
-- annotations.allmaps.org and flips `georef_done` false → true — and that is all it
-- does. The status did not change, so the trigger returned early; and at publish
-- time `georef_done` was false, so 064's gate had already suppressed the mirror.
-- No `mirror_annotation` job is ever queued, and the map serves its georeference
-- from allmaps.org forever, which is the single thing mirroring exists to prevent.
--
-- The fix is the flip itself as a second entry condition, and the trigger widened to
-- watch the column. Publishing behaves exactly as it did under 064.
--
-- `tile_to_r2` is deliberately NOT on the flip path. Georeferencing says where a
-- sheet sits on the earth; it says nothing about where its tiles are served from,
-- which is what tiling answers and what the publish path already asked. Re-queueing
-- it on every flip would re-tile sheets that are already on our host — the exact
-- waste 064 was written to stop.
--
-- `on conflict do nothing` still rides the one-live-job index from 053
-- (`idx_pipeline_jobs_one_live on (kind, map_id) where status in ('queued','claimed','running')`),
-- so a flip while a mirror is already in flight adds nothing.

create or replace function public.enqueue_publish_jobs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  publishing boolean;
  georef_flip boolean;
begin
  if new.status not in ('public', 'featured') then
    return new;
  end if;

  -- The publish path: an INSERT straight into public/featured, or a status change
  -- into it. An edit to an already-public map is still not a publish.
  publishing := tg_op = 'INSERT' or old.status is distinct from new.status;

  -- The georeference path: an already-published map that has just become
  -- georeferenceable. This is what sync-georef does.
  georef_flip := tg_op = 'UPDATE'
                 and not publishing
                 and coalesce(old.georef_done, false) = false
                 and coalesce(new.georef_done, false) = true;

  if not publishing and not georef_flip then
    return new;
  end if;

  -- Our own copy of the georeference, so the viewer never calls allmaps.org.
  -- Only when there is one to copy.
  if new.annotation_url is null and new.allmaps_id is not null and new.georef_done then
    insert into public.pipeline_jobs (kind, map_id, payload)
    values ('mirror_annotation', new.id, jsonb_build_object('allmaps_id', new.allmaps_id))
    on conflict do nothing;
  end if;

  -- Our own tiles, unless they are already served from our own host. Publish path
  -- only — see the header: a georeference flip does not move any tiles.
  if publishing
     and new.iiif_image is not null
     and new.iiif_image not like 'https://iiif.maparchive.vn/%'
  then
    insert into public.pipeline_jobs (kind, map_id, payload)
    values ('tile_to_r2', new.id, jsonb_build_object('iiif_image', new.iiif_image))
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- Watch georef_done too, or the flip never reaches the function above.
drop trigger if exists maps_enqueue_publish_jobs on public.maps;
create trigger maps_enqueue_publish_jobs
  after insert or update of status, georef_done on public.maps
  for each row execute function public.enqueue_publish_jobs();

-- Backfill: the maps the hole has already stranded — published, georeferenced,
-- still no annotation of our own. Empty is a valid answer.
insert into public.pipeline_jobs (kind, map_id, payload)
select 'mirror_annotation', m.id, jsonb_build_object('allmaps_id', m.allmaps_id)
  from public.maps m
 where m.status in ('public', 'featured')
   and m.annotation_url is null
   and m.allmaps_id is not null
   and m.georef_done
on conflict do nothing;
