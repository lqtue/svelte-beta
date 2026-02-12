-- Fix overly permissive label_tasks UPDATE policy
-- The original policy used USING (true) WITH CHECK (true), allowing
-- unrestricted updates by any user (including anonymous) on all rows
-- and columns. Replace with a scoped policy:
--   - Admins can update any task
--   - Authenticated users can only update tasks with 'open' or 'in_progress' status

DROP POLICY IF EXISTS "label_tasks_update" ON public.label_tasks;

CREATE POLICY "label_tasks_update"
  ON public.label_tasks FOR UPDATE
  USING (
    -- admins can update any task
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
    or
    -- authenticated users can update open/in_progress tasks
    (auth.uid() is not null and status in ('open', 'in_progress'))
  );
