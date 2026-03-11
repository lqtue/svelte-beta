-- Footprint submissions: building polygon outlines traced from historical maps
-- Pixel coordinates stored so they can be re-projected if georef is corrected.

CREATE TABLE IF NOT EXISTS footprint_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES label_tasks(id) ON DELETE CASCADE,
  pin_id UUID REFERENCES label_pins(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Outer ring as [[x1,y1],[x2,y2],...] in IIIF pixel space (y+ = down)
  pixel_polygon JSONB NOT NULL,
  -- Denormalized label for easy querying / export without joining pins
  label TEXT,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'consensus', 'verified', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_footprints_task ON footprint_submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_footprints_user ON footprint_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_footprints_status ON footprint_submissions(status);

ALTER TABLE footprint_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "footprints_read"
  ON footprint_submissions FOR SELECT
  USING (true);

-- Authenticated users create their own
CREATE POLICY "footprints_insert"
  ON footprint_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own
CREATE POLICY "footprints_delete"
  ON footprint_submissions FOR DELETE
  USING (auth.uid() = user_id);
