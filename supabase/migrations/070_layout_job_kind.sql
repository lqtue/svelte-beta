-- Migration 070 — `layout` becomes a job kind
--
-- Triage has meant one rectangle: the neatline, everything inside it tiled the
-- same way. A sheet is not one thing. It carries a main map, a title block, a
-- legend, sometimes an index of street names, sometimes an inset at a different
-- scale, and always some furniture — scale bar, north arrow, archival stamps —
-- that costs money to OCR and returns nothing.
--
-- `ocr.py scout` already asks the model for two of those (map_content_bbox and
-- cartouche_bbox). This kind runs that pass as a job so the rest can be asked
-- for too, and the answer saved where a person can correct it before any tiles
-- are read. It is a job rather than a route because the Gemini key lives on the
-- worker and deliberately not in the web app.
--
-- The regions land in `maps.triage.regions` (migration 069's jsonb), so no new
-- column: the triage is still one object per map, overwritten rather than
-- accumulated.

-- `warp` is in this list because production already has it and no migration
-- ever said so. The warp backfill (commit 8a723df) queued two `warp` jobs, and
-- the kind check must have been widened by hand in the Dashboard SQL Editor to
-- let them in — 061 is the last migration to touch the constraint and it has no
-- `warp`. Rebuilding the list from the migrations alone therefore fails with
-- `check constraint "pipeline_jobs_kind_check" ... is violated by some row`,
-- which is exactly what happened on the first attempt at this migration.
-- Recorded here rather than fixed quietly: the lesson is that a constraint
-- edited outside `supabase/migrations/` is invisible until the next one rebuilds
-- it, and `vma_worker.py` has claimed `warp` as a server kind all along.

alter table public.pipeline_jobs drop constraint if exists pipeline_jobs_kind_check;

alter table public.pipeline_jobs
  add constraint pipeline_jobs_kind_check
    check (kind in (
      'ingest_map', 'tile_to_r2', 'mirror_annotation', 'sync_allmaps',
      'ocr', 'seg', 'join', 'warp', 'layout', 'render_preview', 'build_pmtiles'
    ));

comment on column public.maps.triage is
  'Saved OCR triage: { neatline, regions, tile_size, overlap, tile_overrides, saved_at, saved_by }. '
  '`regions` is the layout pass: [{ category, bbox, confidence, source }] in source pixels, '
  'category one of sheet|main_map|title|legend|name_list|inset|scale_bar|north_arrow|stamp. '
  'Written by /contribute/digitalize and the `layout` job, read by scripts/enqueue_ocr_all.mjs. '
  'Empty object = never triaged.';
