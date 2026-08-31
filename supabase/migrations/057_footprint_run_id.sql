-- Migration 057 — give footprints a run identity (ROADMAP C0)
--
-- ocr_extractions has run_id; footprint_submissions had nothing equivalent, so
-- a label↔footprint join over a map mixed every segmentation run ever stored
-- against every OCR run — the stale cross-join C0 was meant to rule out.
--
-- Nullable: hand-traced footprints have no run, and that is the point.

alter table public.footprint_submissions
  add column if not exists run_id text;

comment on column public.footprint_submissions.run_id is
  'Segmentation run that produced this polygon (MapSAM2 --run-id). Null for hand-traced footprints.';

create index if not exists idx_footprints_run on public.footprint_submissions (map_id, run_id)
  where run_id is not null;
