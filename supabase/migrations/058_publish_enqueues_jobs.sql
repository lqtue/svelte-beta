-- Migration 058 — publishing a map enqueues its hosting work (architecture step 4)
--
-- Decision 5 in docs/architecture-target.md: we host the imagery. A public map
-- should therefore have its own R2 tiles and its own copy of the georeference
-- annotation, so nothing on the page depends on allmaps.org staying up.
--
-- Rather than make an admin remember two buttons, the transition into public
-- queues the two jobs. `on conflict do nothing` leans on the one-live-job index
-- from 053, so re-publishing a map does not pile up duplicates.
--
-- The matching NOT NULL constraint on annotation_url is deliberately NOT added
-- yet: no worker runs these kinds today, so the queue has to drain first.

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
  if new.annotation_url is null and new.allmaps_id is not null then
    insert into public.pipeline_jobs (kind, map_id, payload)
    values ('mirror_annotation', new.id, jsonb_build_object('allmaps_id', new.allmaps_id))
    on conflict do nothing;
  end if;

  -- Our own tiles, unless the map is already served from R2.
  if new.source_type is distinct from 'r2' and new.iiif_image is not null then
    insert into public.pipeline_jobs (kind, map_id, payload)
    values ('tile_to_r2', new.id, jsonb_build_object('iiif_image', new.iiif_image))
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists maps_enqueue_publish_jobs on public.maps;
create trigger maps_enqueue_publish_jobs
  after insert or update of status on public.maps
  for each row execute function public.enqueue_publish_jobs();

-- Backfill: every already-public map that is missing either artefact.
insert into public.pipeline_jobs (kind, map_id, payload)
select 'mirror_annotation', m.id, jsonb_build_object('allmaps_id', m.allmaps_id)
  from public.maps m
 where m.status in ('public', 'featured')
   and m.annotation_url is null
   and m.allmaps_id is not null
on conflict do nothing;

insert into public.pipeline_jobs (kind, map_id, payload)
select 'tile_to_r2', m.id, jsonb_build_object('iiif_image', m.iiif_image)
  from public.maps m
 where m.status in ('public', 'featured')
   and m.source_type is distinct from 'r2'
   and m.iiif_image is not null
on conflict do nothing;
