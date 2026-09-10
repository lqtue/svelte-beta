-- Migration 079 — close three RLS holes the API routes were the only guard against
--
-- Every /api route gates correctly. None of that matters: the publishable key
-- ships in the client bundle, sign-in is open Google OAuth with no allowlist,
-- and PostgREST answers that key directly. RLS is the real perimeter, and in
-- three places it was looser than the route in front of it.
--
--   1. profiles.role — `profiles_update_own` (mig 001) is `using (auth.uid() =
--      id)` with a comment reading "but not role". Postgres RLS has no column
--      granularity, so the comment was the only thing enforcing it: any signed
--      -in user could PATCH their own row to role='admin' and the check
--      constraint (mig 038) permits the value. requireRole() then reads that
--      column. Fixed with a column-level GRANT, which is what actually does
--      column granularity.
--
--   2. maps.status — `maps_insert_auth` (mig 038) checks only that a session
--      exists, and `maps_update_own_or_mod` has no `with check`, so its `using`
--      clause is reused and says nothing about status. The column comment says
--      "Admin-only to set public/featured". Nothing enforced it: one INSERT
--      with status='public' put arbitrary content on the front page, and mig
--      058's publish trigger spent pipeline jobs on it.
--
--   3. footprint_submissions — `footprints_insert` checks only for a session:
--      no user_id, no status. A row could be inserted as somebody else with
--      status='approved', landing straight in the public /api/export/footprints
--      feed and skipping both the review queue and the route's rate limit.
--
-- `stories` (mig 059) already does this correctly and is the pattern followed
-- here. Nothing in src/ writes to `profiles` or `maps` with the publishable
-- key, and the footprint writes it does make (geometry, name, feature_type via
-- `updateFootprint`/`updateFootprintMeta`) leave status and user_id alone.

-- ── 1. profiles.role is not self-service ─────────────────────────────────
-- Supabase's default `grant all on all tables in schema public` is what lets
-- an owner write every column; narrow it to the one column a profile owner
-- has any business editing. service_role is granted separately and unaffected,
-- so /api/admin/* and handle_new_user() keep working.

revoke update on public.profiles from anon, authenticated;
grant  update (display_name) on public.profiles to authenticated;

-- ── 2. only staff may publish a map ──────────────────────────────────────

drop policy if exists "maps_insert_auth" on public.maps;
create policy "maps_insert_auth"
  on public.maps for insert
  with check (
    auth.uid() is not null
    and (
      status = 'draft'
      or exists (select 1 from public.profiles
                  where id = auth.uid() and role in ('mod', 'admin'))
    )
  );

drop policy if exists "maps_update_own_or_mod" on public.maps;
create policy "maps_update_own_or_mod"
  on public.maps for update
  using (
    created_by = auth.uid()
    or exists (select 1 from public.profiles
                where id = auth.uid() and role in ('mod', 'admin'))
  )
  with check (
    (created_by = auth.uid() and status = 'draft')
    or exists (select 1 from public.profiles
                where id = auth.uid() and role in ('mod', 'admin'))
  );

-- ── 3. a contributor owns their footprint, not its verdict ───────────────

drop policy if exists "footprints_insert" on public.footprint_submissions;
create policy "footprints_insert"
  on public.footprint_submissions for insert
  with check (user_id = auth.uid() and status in ('draft', 'submitted'));

drop policy if exists "footprints_update_own_or_mod" on public.footprint_submissions;
create policy "footprints_update_own_or_mod"
  on public.footprint_submissions for update
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles
                where id = auth.uid() and role in ('mod', 'admin'))
  )
  with check (
    (user_id = auth.uid() and status in ('draft', 'submitted'))
    or exists (select 1 from public.profiles
                where id = auth.uid() and role in ('mod', 'admin'))
  );

comment on column public.profiles.role is
  'null/user = any logged-in contributor. mod = can mark canonical submissions, respond to help requests. admin = full access + publish maps. Not writable with the publishable key — see migration 079.';
