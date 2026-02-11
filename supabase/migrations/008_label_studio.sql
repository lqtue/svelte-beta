-- Label Studio: tasks and pins for collaborative map labeling

-- Label tasks — regions of a historical map to be labeled
CREATE TABLE IF NOT EXISTS label_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id TEXT NOT NULL,
  region JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'consensus', 'verified')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Label pins — individual label submissions by users
CREATE TABLE IF NOT EXISTS label_pins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES label_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  pixel_x REAL NOT NULL,
  pixel_y REAL NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_label_tasks_status ON label_tasks(status);
CREATE INDEX IF NOT EXISTS idx_label_tasks_map ON label_tasks(map_id);
CREATE INDEX IF NOT EXISTS idx_label_pins_task ON label_pins(task_id);
CREATE INDEX IF NOT EXISTS idx_label_pins_user ON label_pins(user_id);

-- RLS
ALTER TABLE label_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE label_pins ENABLE ROW LEVEL SECURITY;

-- Anyone can read tasks
CREATE POLICY "label_tasks_read"
  ON label_tasks FOR SELECT
  USING (true);

-- Only admins can create/update/delete tasks (via service role or admin check)
-- For now, allow authenticated users to update status
CREATE POLICY "label_tasks_update"
  ON label_tasks FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read all pins
CREATE POLICY "label_pins_read"
  ON label_pins FOR SELECT
  USING (true);

-- Authenticated users can create their own pins
CREATE POLICY "label_pins_insert"
  ON label_pins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own pins
CREATE POLICY "label_pins_delete"
  ON label_pins FOR DELETE
  USING (auth.uid() = user_id);
