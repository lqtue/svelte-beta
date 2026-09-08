-- 078: why a scout candidate was approved or rejected.
--
-- `reasons` already exists but belongs to the scorer — load_scout_to_db.mjs
-- overwrites it on every re-load, so a human note parked there would be lost
-- the next time the source is re-scouted. This column is the person's, and
-- nothing but the review UI writes it.
--
-- Nullable on purpose: a reason is optional, and 1041 rows were decided (or
-- left pending) before it existed.

alter table scout_candidates
  add column if not exists review_note text;

comment on column scout_candidates.review_note is
  'Reviewer''s reason for the approve/reject decision. Optional, human-written; distinct from `reasons`, which the scorer generates.';
