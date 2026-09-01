-- Migration 061 — `join` becomes a job kind (ROADMAP C1)
--
-- The label↔footprint join (work/ocr/scripts/join_labels.py) was a hand-run
-- script. It is the third stage of the same pipeline as ocr and seg, so it
-- belongs in the same queue: enqueue it after a seg run and a worker picks it
-- up with everything else.

alter table public.pipeline_jobs drop constraint if exists pipeline_jobs_kind_check;

alter table public.pipeline_jobs
  add constraint pipeline_jobs_kind_check
    check (kind in (
      'ingest_map', 'tile_to_r2', 'mirror_annotation', 'sync_allmaps',
      'ocr', 'seg', 'join', 'render_preview', 'build_pmtiles'
    ));
