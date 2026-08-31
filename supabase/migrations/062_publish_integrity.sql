-- Migration 062 — finish B4, and repair the stage history 056 could not derive.
--
-- 1. A published map must be georeferenceable.
--
-- The plan said `annotation_url NOT NULL` for public maps. That deadlocks:
-- publishing is what enqueues `mirror_annotation`, so requiring the mirrored
-- URL *before* the publish makes the trigger unreachable. What actually matters
-- is that a public map can be georeferenced at all — `annotationUrlForSource()`
-- accepts either the self-hosted URL or the bare Allmaps id — so that is what
-- is enforced. Full self-hosting stays the queue's job, not the constraint's.
--
-- All 38 published maps satisfy this today.

alter table public.maps drop constraint if exists maps_public_needs_georef;

alter table public.maps
  add constraint maps_public_needs_georef
    check (
      status not in ('public', 'featured')
      or annotation_url is not null
      or allmaps_id is not null
    );

-- 2. Stage history.
--
-- 056 derives ocr/seg stages from pipeline_jobs, which did not exist when the
-- earlier runs happened, so a map with thousands of extractions reads `idle`.
-- One synthetic finished job per map that already has extractions restores what
-- the old table used to say. `created_at` is the run's own last write, so the
-- ordering the view relies on stays truthful.

insert into public.pipeline_jobs (kind, map_id, payload, status, attempts, created_at, finished_at)
select 'ocr',
       e.map_id,
       jsonb_build_object('run_id', e.run_id, 'backfilled', true),
       'done',
       1,
       e.last_seen,
       e.last_seen
  from (
        select map_id, run_id, max(created_at) as last_seen,
               row_number() over (partition by map_id order by max(created_at) desc) as rn
          from public.ocr_extractions
         group by map_id, run_id
       ) e
 where e.rn = 1
   and not exists (
         select 1 from public.pipeline_jobs j
          where j.map_id = e.map_id and j.kind = 'ocr'
       );
