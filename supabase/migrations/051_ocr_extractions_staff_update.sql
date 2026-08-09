-- Tighten who can UPDATE ocr_extractions.
--
-- Migration 042 opened UPDATE to ANY authenticated user
-- (auth.role() = 'authenticated'), so the DB was a weaker line of defense than
-- the review API, which already gates on an admin/mod role. Any logged-in user
-- with the anon key could PATCH validation fields (text_validated, status, …).
--
-- Replace that policy with the same staff check the rest of the review flow
-- uses (see migrations 038, 045). Service-role writes are unaffected — they
-- flow through the separate 'for all' service_role policy from migration 040.

drop policy if exists "ocr_extractions_auth_validate" on ocr_extractions;

create policy "ocr_extractions_staff_validate"
  on ocr_extractions for update
  using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('admin', 'mod'))
  )
  with check (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('admin', 'mod'))
  );
