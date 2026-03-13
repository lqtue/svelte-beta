-- Extend footprint_submissions for SAM-automated pipeline inserts.
-- task_id / user_id become nullable so automated jobs can insert
-- without a label task or authenticated user.
-- map_id + allmaps_id stored directly on automated rows (no join needed).

ALTER TABLE footprint_submissions
  ALTER COLUMN task_id DROP NOT NULL,
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE footprint_submissions
  ADD COLUMN IF NOT EXISTS map_id          UUID REFERENCES maps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allmaps_id      TEXT,
  ADD COLUMN IF NOT EXISTS iiif_canvas     TEXT,
  ADD COLUMN IF NOT EXISTS source          TEXT NOT NULL DEFAULT 'volunteer'
    CHECK (source IN ('volunteer', 'sam-auto', 'import')),
  ADD COLUMN IF NOT EXISTS valid_from      TEXT,   -- ISO 8601 partial: '1882', '1898-03'
  ADD COLUMN IF NOT EXISTS valid_to        TEXT,
  ADD COLUMN IF NOT EXISTS confidence      FLOAT,  -- SAM predicted IoU
  ADD COLUMN IF NOT EXISTS temporal_status TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (temporal_status IN ('stable','new','demolished','modified','unclassified'));

-- Either a label task or a direct map reference must exist
ALTER TABLE footprint_submissions
  ADD CONSTRAINT footprints_must_have_task_or_map
    CHECK (task_id IS NOT NULL OR map_id IS NOT NULL);

-- Service-role policy for automated pipeline inserts (no auth.uid())
CREATE POLICY "footprints_service_insert"
  ON footprint_submissions FOR INSERT
  WITH CHECK (user_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_footprints_map      ON footprint_submissions(map_id);
CREATE INDEX IF NOT EXISTS idx_footprints_source   ON footprint_submissions(source);
CREATE INDEX IF NOT EXISTS idx_footprints_temporal ON footprint_submissions(temporal_status);
