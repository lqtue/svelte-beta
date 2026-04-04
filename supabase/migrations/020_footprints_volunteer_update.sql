-- Allow authenticated volunteers to update their own footprint submissions.
-- Without this, updateFootprintMeta (label/type edits) silently fails for regular users.
-- The existing footprints_service_update policy only covers the service role.

CREATE POLICY "footprints_update_own"
  ON footprint_submissions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
