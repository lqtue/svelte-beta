-- Migration 015: Add submitted/closed statuses and claim support for VWAI workflow

-- Drop old check constraint and recreate with new statuses
alter table cdec_records
  drop constraint if exists cdec_records_status_check;

alter table cdec_records
  add constraint cdec_records_status_check
  check (status in ('pending','in_review','submitted','validated','closed','flagged','duplicate'));

-- Add claimed_at timestamp (when the record was first claimed by an editor)
alter table cdec_records
  add column if not exists claimed_at timestamptz;

-- RLS: any authenticated user can view
drop policy if exists "vwai_member_select" on cdec_records;

create policy "authenticated_select" on cdec_records
  for select
  using (auth.uid() is not null);

-- RLS: assigned user can update their own record (edit + submit)
drop policy if exists "vwai_member_update_own" on cdec_records;

create policy "assigned_user_update" on cdec_records
  for update
  using (assigned_to = auth.uid() and auth.uid() is not null)
  with check (assigned_to = auth.uid() and auth.uid() is not null);

-- RLS: any authenticated user can claim an unclaimed record
-- (atomic claim is enforced server-side; RLS permits the update when assigned_to is null)
create policy "authenticated_claim" on cdec_records
  for update
  using (assigned_to is null and auth.uid() is not null)
  with check (auth.uid() is not null);
