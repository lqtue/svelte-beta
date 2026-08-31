-- Migration 053 — pipeline_jobs + worker_keys (architecture-target step 1)
--
-- Replaces "copy this CLI command and run it yourself" with a queue. The web
-- app enqueues; any machine running `work/worker/vma_worker.py` claims and
-- runs. Claiming goes through claim_job() so a worker needs only the REST
-- endpoint and a key — never a direct database connection.
--
-- Both tables are service-role only: RLS is on with no policies, so the anon
-- and authenticated roles cannot see a job or a key hash. Staff read through
-- /api/* with the service client.

-- ────────────────────────────────────────────────────────────
-- 1. pipeline_jobs
-- ────────────────────────────────────────────────────────────

create table if not exists public.pipeline_jobs (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null
                 check (kind in (
                   'ingest_map', 'tile_to_r2', 'mirror_annotation', 'sync_allmaps',
                   'ocr', 'seg', 'render_preview', 'build_pmtiles'
                 )),
  map_id       uuid references public.maps(id) on delete cascade,
  payload      jsonb not null default '{}',
  status       text not null default 'queued'
                 check (status in ('queued', 'claimed', 'running', 'done', 'failed', 'cancelled')),
  priority     integer not null default 0,
  attempts     integer not null default 0,
  max_attempts integer not null default 3,
  worker       text,
  result       jsonb,
  error        text,
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz,
  started_at   timestamptz,
  finished_at  timestamptz,
  updated_at   timestamptz not null default now()
);

comment on table  public.pipeline_jobs         is 'Work queue between the web app and the python workers. One row per pipeline run.';
comment on column public.pipeline_jobs.payload is 'Kind-specific arguments, e.g. for ocr: run_id, tile_size, overlap, neatline, tile_overrides.';
comment on column public.pipeline_jobs.worker  is 'Name of the machine holding the claim, from --worker. Not a foreign key: a key can be revoked while its job is still running.';

-- The claim query: cheapest possible index for "oldest queued job of these kinds".
create index if not exists idx_pipeline_jobs_claim
  on public.pipeline_jobs (kind, priority desc, created_at)
  where status = 'queued';

create index if not exists idx_pipeline_jobs_map on public.pipeline_jobs (map_id);

-- One live job per kind per map, so a double-clicked "Run OCR" enqueues once.
create unique index if not exists idx_pipeline_jobs_one_live
  on public.pipeline_jobs (kind, map_id)
  where status in ('queued', 'claimed', 'running');

create or replace function public.pipeline_jobs_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger pipeline_jobs_updated_at
  before update on public.pipeline_jobs
  for each row execute function public.pipeline_jobs_set_updated_at();

alter table public.pipeline_jobs enable row level security;

-- ────────────────────────────────────────────────────────────
-- 2. worker_keys — one revocable bearer token per machine
-- ────────────────────────────────────────────────────────────

create table if not exists public.worker_keys (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  token_hash   text not null unique,
  kinds        text[] not null default '{}',
  last_seen_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

comment on table  public.worker_keys            is 'Per-machine credentials for the pipeline workers. Step 2 authenticates /api/pipeline/results with these.';
comment on column public.worker_keys.token_hash is 'sha256 hex of the bearer token. The token itself is shown once, at creation, and never stored.';
comment on column public.worker_keys.kinds      is 'Job kinds this key may report results for. Empty array = all kinds.';

create index if not exists idx_worker_keys_active on public.worker_keys (revoked_at) where revoked_at is null;

alter table public.worker_keys enable row level security;

-- ────────────────────────────────────────────────────────────
-- 3. claim_job / finish_job
-- ────────────────────────────────────────────────────────────

-- Atomically hand exactly one queued job to one worker. FOR UPDATE SKIP LOCKED
-- is what lets several workers poll the same kinds without coordinating.
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
            where status = 'queued'
              and kind = any(p_kinds)
            order by priority desc, created_at
            for update skip locked
            limit 1
         )
  returning j.* into claimed;

  return claimed;  -- null row when the queue is empty
end;
$$;

-- Close a job out. A failure with attempts left goes back to 'queued' rather
-- than 'failed', so a worker dying mid-run costs one retry, not the job.
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
         finished_at = case when p_status in ('done', 'failed') then now() else null end,
         result      = coalesce(p_result, j.result),
         error       = p_error
   where j.id = p_id
  returning j.* into finished;

  return finished;
end;
$$;

revoke all on function public.claim_job(text[], text)             from public, anon, authenticated;
revoke all on function public.finish_job(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.claim_job(text[], text)             to service_role;
grant execute on function public.finish_job(uuid, text, jsonb, text) to service_role;
