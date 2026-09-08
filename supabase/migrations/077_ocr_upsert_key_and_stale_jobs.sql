-- Migration 077 — three fixes to the automated write path, audited 2026-09-08.
--
-- 1. The OCR upsert key silently dropped rows.
-- 2. A stranded job wedged its map forever.
-- 3. finish_job kept a stale result while clearing the error.
--
-- All three are in the path that runs unattended, which is why none of them
-- were visible: each one produced plausible output.

-- ────────────────────────────────────────────────────────────
-- 1. ocr_extractions: position belongs in the upsert key
-- ────────────────────────────────────────────────────────────
--
-- The key was (map_id, run_id, tile_x, tile_y, text), on the assumption that
-- the same text in the same tile is the same label. On a cadastral sheet it is
-- not: eight distinct "Rue" labels share one tile, and four "N° 18" do. The
-- two-pass merge made it worse, because it keys every merged row to the tile
-- origin of whichever pass won the vote, concentrating labels that came from
-- all over the sheet onto one origin. Measured on the 1882 gate sheet: the
-- merge sent 337 rows and 18 of them (5.3%) overwrote each other, against 1
-- of 210 for a single pass. Adding the box's own corner takes it to zero.
--
-- Re-keying by the label's own grid cell instead was measured and is worse
-- (47 rows lost) — a coarse cell concentrates more, not less. Position has to
-- be in the key.
--
-- Rounded to whole pixels because the coordinates are doubles and the key has
-- to survive a re-run: sub-pixel jitter must still collide. PostgREST needs
-- real columns in `on_conflict`, so this cannot be an expression index — hence
-- the two generated columns rather than round() inline.

-- Nothing has ever written a null box: every code path skips extractions
-- without a global_bbox, and the live table has 0 of 365 rows with one.
alter table public.ocr_extractions
  alter column global_x set not null,
  alter column global_y set not null;

alter table public.ocr_extractions
  add column if not exists global_xi integer
    generated always as (round(global_x)::integer) stored,
  add column if not exists global_yi integer
    generated always as (round(global_y)::integer) stored;

comment on column public.ocr_extractions.global_xi is
  'round(global_x). Exists only to sit in ocr_extractions_upsert_key: PostgREST cannot name an expression index in on_conflict.';
comment on column public.ocr_extractions.global_yi is
  'round(global_y). See global_xi.';

drop index if exists public.ocr_extractions_upsert_key;

create unique index ocr_extractions_upsert_key
  on public.ocr_extractions (map_id, run_id, tile_x, tile_y, text, global_xi, global_yi);

-- ────────────────────────────────────────────────────────────
-- 2. claim_job also reclaims a stranded job
-- ────────────────────────────────────────────────────────────
--
-- Before this, claim_job took only status = 'queued'. Nothing anywhere in the
-- repo reset, cancelled or timed out a job — the 'cancelled' status in the
-- check constraint has never been written. So a worker that died mid-run (a
-- Ctrl-C, a laptop asleep, a 502 on the results POST after a 45-minute batch)
-- left its row in 'running' for good, and because idx_pipeline_jobs_one_live
-- makes (kind, map_id) unique across queued/claimed/running, that map's Run
-- OCR button returned 409 forever and enqueue_ocr_all.mjs skipped the sheet as
-- in flight. It had already happened once (ocr job 107182d6).
--
-- Three hours is chosen against the longest legitimate run: a three-pass OCR
-- on a dense sheet is about 51 minutes of model time, plus rate-limit backoff.
-- Reclaiming a job whose worker is in fact alive runs it twice, which the OCR
-- path survives — batch resumes from per-tile JSON and the upsert is
-- idempotent — and `attempts` still caps the total at max_attempts.
create or replace function public.claim_job(p_kinds text[], p_worker text)
returns public.pipeline_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.pipeline_jobs;
begin
  update public.pipeline_jobs j
     set status     = 'claimed',
         worker     = p_worker,
         claimed_at = now(),
         attempts   = j.attempts + 1
   where j.id = (
           select id
             from public.pipeline_jobs
            where kind = any(p_kinds)
              and (
                status = 'queued'
                -- Stranded: held by a worker that never reported back.
                or (status in ('claimed', 'running')
                    and attempts < max_attempts
                    -- greatest() ignores nulls, so this is the later of the two
                    -- whichever is set.
                    and greatest(started_at, claimed_at) < now() - interval '3 hours')
              )
            -- Queued work first, so a reclaim never jumps the fresh queue.
            order by (status <> 'queued'), priority desc, created_at
            for update skip locked
            limit 1
         )
  returning j.* into claimed;

  return claimed;  -- null row when the queue is empty
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. finish_job: consistent bookkeeping
-- ────────────────────────────────────────────────────────────
--
-- Two inconsistencies, both from 053. `result` was coalesced (keeping the
-- previous attempt's) while `error` was overwritten with null, so a retry
-- inherited a stale result and lost the reason it was retrying. And a failure
-- that requeues set finished_at while status went back to 'queued', so the row
-- claimed to be both finished and waiting.
create or replace function public.finish_job(
  p_id     uuid,
  p_status text,
  p_result jsonb default '{}',
  p_error  text  default null
)
returns public.pipeline_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  finished public.pipeline_jobs;
begin
  if p_status not in ('done', 'failed', 'running') then
    raise exception 'finish_job: status must be done, failed or running (got %)', p_status;
  end if;

  update public.pipeline_jobs j
     set status      = case
                         when p_status = 'failed' and j.attempts < j.max_attempts then 'queued'
                         else p_status
                       end,
         worker      = case when p_status = 'running' then j.worker else null end,
         started_at  = case when p_status = 'running' then now() else j.started_at end,
         -- Terminal only. A requeued failure is not finished.
         finished_at = case
                         when p_status = 'done' then now()
                         when p_status = 'failed' and j.attempts >= j.max_attempts then now()
                         else null
                       end,
         -- An attempt starting clears both; an attempt ending sets both.
         result      = case when p_status = 'running' then null else p_result end,
         error       = case when p_status = 'running' then null else p_error end
   where j.id = p_id
  returning j.* into finished;

  return finished;
end;
$$;

revoke all on function public.claim_job(text[], text)             from public, anon, authenticated;
revoke all on function public.finish_job(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.claim_job(text[], text)             to service_role;
grant execute on function public.finish_job(uuid, text, jsonb, text) to service_role;

-- ────────────────────────────────────────────────────────────
-- 4. set_triage_key — one atomic write into maps.triage
-- ────────────────────────────────────────────────────────────
--
-- The layout job's write-back did `select triage` → mutate in JS → `update
-- maps set triage = <whole object>`. Two writers — a layout job closing while
-- the person who queued it presses Save triage on the same page, which is the
-- normal case, since the page polls for that job — and the later write
-- silently discarded the other's *entire* triage: neatline, tile grid and
-- per-tile priorities included, not just the key in dispute.
--
-- jsonb_set touches one key in one statement, so the other keys cannot be
-- lost. Two writers racing on the *same* key still resolve last-write-wins,
-- which is a real conflict either way and not something a merge can invent an
-- answer for.
create or replace function public.set_triage_key(
  p_map_id uuid,
  p_key    text,
  p_value  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated jsonb;
begin
  if p_key !~ '^[a-z_]+$' then
    raise exception 'set_triage_key: refusing key %', p_key;
  end if;

  -- A null value removes the key. jsonb_set with a NULL new_value returns NULL
  -- for the *whole* document, so without this branch "withdraw the validation"
  -- would erase the entire triage.
  update public.maps m
     set triage = case
                    when p_value is null
                      then coalesce(m.triage, '{}'::jsonb) - p_key
                    else jsonb_set(coalesce(m.triage, '{}'::jsonb), array[p_key], p_value, true)
                  end
   where m.id = p_map_id
  returning m.triage into updated;

  if updated is null then
    raise exception 'set_triage_key: no map %', p_map_id;
  end if;

  return updated;
end;
$$;

revoke all on function public.set_triage_key(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_triage_key(uuid, text, jsonb) to service_role;
