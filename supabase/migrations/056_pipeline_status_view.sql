-- Migration 056 — map_pipeline_status becomes a view (architecture-target step 3)
--
-- The table had two writers: the API (human progress) and the pipeline scripts
-- (machine progress), which is exactly the drift the one-writer-per-table rule
-- exists to prevent. Machine stages are already recorded in pipeline_jobs, so
-- they are derived here instead of copied. What is left over is the three
-- stages a person asserts — reviewed, seg_reviewed, exported — and those get
-- their own small table.

create table if not exists public.map_review_marks (
  map_id          uuid primary key references public.maps(id) on delete cascade,
  reviewed_at     timestamptz,
  seg_reviewed_at timestamptz,
  exported_at     timestamptz,
  updated_at      timestamptz not null default now()
);

comment on table public.map_review_marks is
  'The pipeline stages a human asserts. Machine stages come from pipeline_jobs; map_pipeline_status composes both.';

create or replace function public.map_review_marks_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger map_review_marks_updated_at
  before update on public.map_review_marks
  for each row execute function public.map_review_marks_set_updated_at();

alter table public.map_review_marks enable row level security;

-- Carry the human stages over from the old table before it goes.
insert into public.map_review_marks (map_id, reviewed_at, seg_reviewed_at, exported_at)
select s.map_id,
       coalesce(s.reviewed_at, case when s.stage in ('reviewed', 'seg_queued', 'seg_done', 'seg_reviewed', 'exported') then s.updated_at end),
       case when s.stage in ('seg_reviewed', 'exported') then s.updated_at end,
       case when s.stage = 'exported' then s.updated_at end
  from public.map_pipeline_status s
 where s.stage <> 'idle'
on conflict (map_id) do nothing;

drop table public.map_pipeline_status;

-- Same shape the API and the sidebars already read, now derived.
--
-- Stage is the furthest point reached, so the cases run backwards along
-- idle → ocr_queued → ocr_done → reviewed → seg_queued → seg_done →
-- seg_reviewed → exported and the first match wins.
create view public.map_pipeline_status as
with latest as (
  select j.map_id,
         j.kind,
         j.status,
         j.payload ->> 'run_id' as run_id,
         j.started_at,
         j.finished_at,
         j.updated_at,
         row_number() over (partition by j.map_id, j.kind order by j.created_at desc) as rn
    from public.pipeline_jobs j
   where j.kind in ('ocr', 'seg')
)
select m.id as map_id,
       case
         when k.exported_at     is not null then 'exported'
         when k.seg_reviewed_at is not null then 'seg_reviewed'
         when seg.status = 'done'                                    then 'seg_done'
         when seg.status in ('queued', 'claimed', 'running')         then 'seg_queued'
         when k.reviewed_at     is not null then 'reviewed'
         when ocr.status = 'done'                                    then 'ocr_done'
         when ocr.status in ('queued', 'claimed', 'running')         then 'ocr_queued'
         else 'idle'
       end                        as stage,
       ocr.run_id                 as ocr_run_id,
       seg.run_id                 as seg_run_id,
       ocr.started_at             as ocr_started_at,
       ocr.finished_at            as ocr_finished_at,
       seg.started_at             as seg_started_at,
       seg.finished_at            as seg_finished_at,
       k.reviewed_at,
       k.seg_reviewed_at,
       k.exported_at,
       greatest(
         coalesce(k.updated_at,   'epoch'::timestamptz),
         coalesce(ocr.updated_at, 'epoch'::timestamptz),
         coalesce(seg.updated_at, 'epoch'::timestamptz)
       )                          as updated_at
  from public.maps m
  left join public.map_review_marks k on k.map_id = m.id
  left join latest ocr on ocr.map_id = m.id and ocr.kind = 'ocr' and ocr.rn = 1
  left join latest seg on seg.map_id = m.id and seg.kind = 'seg' and seg.rn = 1;

comment on view public.map_pipeline_status is
  'Per-map pipeline stage: machine stages derived from pipeline_jobs, human stages from map_review_marks. Read-only — advance a stage with set_review_mark().';

-- The one way to move a human stage. Marking a later stage implies the earlier
-- ones, so "mark exported" on an unreviewed map does not read as a step back.
create or replace function public.set_review_mark(p_map_id uuid, p_stage text, p_user uuid)
returns public.map_review_marks
language plpgsql
security definer
set search_path = public
as $$
declare
  marked public.map_review_marks;
begin
  if p_stage not in ('reviewed', 'seg_reviewed', 'exported', 'idle') then
    raise exception 'set_review_mark: stage must be reviewed, seg_reviewed, exported or idle (got %). Machine stages come from pipeline_jobs.', p_stage;
  end if;

  insert into public.map_review_marks (map_id, reviewed_at, seg_reviewed_at, exported_at)
  values (
    p_map_id,
    case when p_stage in ('reviewed', 'seg_reviewed', 'exported') then now() end,
    case when p_stage in ('seg_reviewed', 'exported') then now() end,
    case when p_stage = 'exported' then now() end
  )
  on conflict (map_id) do update
    set reviewed_at     = case when p_stage = 'idle' then null
                               else coalesce(public.map_review_marks.reviewed_at, excluded.reviewed_at) end,
        seg_reviewed_at = case when p_stage = 'idle' then null
                               else coalesce(public.map_review_marks.seg_reviewed_at, excluded.seg_reviewed_at) end,
        exported_at     = case when p_stage = 'idle' then null
                               else coalesce(public.map_review_marks.exported_at, excluded.exported_at) end
  returning * into marked;

  return marked;
end;
$$;

revoke all on function public.set_review_mark(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.set_review_mark(uuid, text, uuid) to service_role;
