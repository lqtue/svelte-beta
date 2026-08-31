-- Migration 055 — let footprint_submissions hold what the code actually writes.
--
-- Two constraints from migration 038 never matched the pipeline:
--
--   * `status` allowed draft/submitted/approved/rejected, but MapSAM2 inserts
--     `needs_review` (work/MapSAM2/inference_tiles_as_video.py) and the whole
--     /contribute/review queue selects on it. Every SAM2 write failed.
--   * `source` allowed volunteer/sam-auto/import, while the review route marks
--     a polygon the reviewer reshaped as `sam-corrected`. Every corrected
--     approval failed.
--
-- Both surfaced from tests/write.spec.ts on a database built from migrations.

alter table public.footprint_submissions
  drop constraint if exists footprint_submissions_status_check;

alter table public.footprint_submissions
  add constraint footprint_submissions_status_check
    check (status in ('draft', 'submitted', 'needs_review', 'approved', 'rejected'));

alter table public.footprint_submissions
  drop constraint if exists footprint_submissions_source_check;

alter table public.footprint_submissions
  add constraint footprint_submissions_source_check
    check (source in ('volunteer', 'sam-auto', 'sam-corrected', 'import'));

comment on column public.footprint_submissions.status is
  'Lifecycle: draft → submitted → approved | rejected. SAM2 output enters as needs_review and leaves via set_footprint_status().';
comment on column public.footprint_submissions.source is
  'volunteer = hand-traced · sam-auto = model output · sam-corrected = model output a reviewer reshaped · import = bulk load.';
