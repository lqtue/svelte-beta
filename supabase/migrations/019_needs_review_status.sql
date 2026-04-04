-- Add 'needs_review' to footprint_submissions.status allowed values.
-- The SAM pipeline inserts rows with status='needs_review' for hatched parcels
-- (militaire, local_svc classes) that need volunteer correction before use.
-- Also adds a service-role update policy so the admin API can approve/reject.

ALTER TABLE footprint_submissions
  DROP CONSTRAINT IF EXISTS footprint_submissions_status_check;

ALTER TABLE footprint_submissions
  ADD CONSTRAINT footprint_submissions_status_check
    CHECK (status IN ('submitted', 'needs_review', 'consensus', 'verified', 'rejected'));

-- Allow service-role (admin API) to update any row's status
CREATE POLICY "footprints_service_update"
  ON footprint_submissions FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Index on needs_review for fast review queue queries
CREATE INDEX IF NOT EXISTS idx_footprints_needs_review
  ON footprint_submissions(map_id, status)
  WHERE status = 'needs_review';
