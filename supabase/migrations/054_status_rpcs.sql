-- Migration 054 — status transitions move into Postgres (architecture-target step 3)
--
-- Setting a review status carries invariants: validating stamps who signed off
-- and when, un-validating clears that stamp, and a footprint only leaves the
-- review queue from `needs_review`. Those rules lived in TypeScript, which
-- works only as long as every writer is the API. Workers, the browser and the
-- API now share one implementation.
--
-- service_role only: contributors reach these through /api/*, per the open
-- contribution model in docs/architecture-target.md.

-- ────────────────────────────────────────────────────────────
-- ocr_extractions
-- ────────────────────────────────────────────────────────────

-- Bulk status change. Scope with explicit ids, or with (map_id, run_id) to take
-- a whole run. Returns the number of rows changed.
create or replace function public.set_extraction_status(
  p_status  text,
  p_user    uuid,
  p_ids     uuid[] default null,
  p_map_id  uuid   default null,
  p_run_id  text   default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_status not in ('validated', 'rejected', 'pending') then
    raise exception 'set_extraction_status: status must be validated, rejected or pending (got %)', p_status;
  end if;
  if p_ids is null and p_map_id is null then
    raise exception 'set_extraction_status: pass p_ids or p_map_id';
  end if;

  update public.ocr_extractions e
     set status       = p_status,
         -- Only a validation records a reviewer; rejecting or reverting clears it.
         validated_at = case when p_status = 'validated' then now() else null end,
         validated_by = case when p_status = 'validated' then p_user else null end
   where (p_ids    is null or e.id     = any(p_ids))
     and (p_map_id is null or e.map_id = p_map_id)
     and (p_run_id is null or e.run_id = p_run_id);

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Undo one reviewer's own recent validations on a map. The window is what the
-- "revert last N minutes" button offers; other reviewers' work is untouched.
create or replace function public.revert_recent_validations(
  p_map_id      uuid,
  p_user        uuid,
  p_window_mins integer default 30
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.ocr_extractions e
     set status       = 'pending',
         validated_at = null,
         validated_by = null
   where e.map_id       = p_map_id
     and e.status       = 'validated'
     and e.validated_by = p_user
     and e.validated_at > now() - make_interval(mins => p_window_mins);

  get diagnostics n = row_count;
  return n;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- footprint_submissions
-- ────────────────────────────────────────────────────────────

-- Review decision on one SAM2 polygon. Edited geometry marks the row
-- 'sam-corrected' so exports can tell a machine polygon from a fixed one.
create or replace function public.set_footprint_status(
  p_id            uuid,
  p_status        text,
  p_user          uuid,
  p_pixel_polygon jsonb default null,
  p_feature_type  text  default null,
  p_name          text  default null,
  p_category      text  default null
)
returns public.footprint_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.footprint_submissions;
begin
  if p_status not in ('submitted', 'approved', 'rejected') then
    raise exception 'set_footprint_status: status must be submitted, approved or rejected (got %)', p_status;
  end if;

  update public.footprint_submissions f
     set status        = p_status,
         pixel_polygon = coalesce(p_pixel_polygon, f.pixel_polygon),
         feature_type  = coalesce(p_feature_type, f.feature_type),
         name          = coalesce(p_name, f.name),
         category      = coalesce(p_category, f.category),
         source        = case
                           when p_pixel_polygon is not null or p_feature_type is not null
                           then 'sam-corrected'
                           else f.source
                         end
   -- A row only leaves the review queue once: re-deciding an already-reviewed
   -- polygon needs a deliberate reset, not a second click.
   where f.id = p_id
     and f.status = 'needs_review'
  returning f.* into updated;

  return updated;  -- null row when the id was missing or already decided
end;
$$;

revoke all on function public.set_extraction_status(text, uuid, uuid[], uuid, text)              from public, anon, authenticated;
revoke all on function public.revert_recent_validations(uuid, uuid, integer)                     from public, anon, authenticated;
revoke all on function public.set_footprint_status(uuid, text, uuid, jsonb, text, text, text)    from public, anon, authenticated;
grant execute on function public.set_extraction_status(text, uuid, uuid[], uuid, text)           to service_role;
grant execute on function public.revert_recent_validations(uuid, uuid, integer)                  to service_role;
grant execute on function public.set_footprint_status(uuid, text, uuid, jsonb, text, text, text) to service_role;
