-- Allow hiding label tasks from the volunteer UI without deleting them
ALTER TABLE label_tasks DROP CONSTRAINT IF EXISTS label_tasks_status_check;
ALTER TABLE label_tasks ADD CONSTRAINT label_tasks_status_check
  CHECK (status IN ('open', 'in_progress', 'consensus', 'verified', 'hidden'));
