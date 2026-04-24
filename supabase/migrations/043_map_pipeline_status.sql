create table map_pipeline_status (
  map_id         uuid primary key references maps(id) on delete cascade,
  stage          text not null default 'idle'
                   check (stage in (
                     'idle', 'ocr_queued', 'ocr_done', 'reviewed',
                     'seg_queued', 'seg_done', 'seg_reviewed', 'exported'
                   )),
  ocr_run_id     text,
  seg_run_id     text,
  ocr_started_at  timestamptz,
  ocr_finished_at timestamptz,
  seg_started_at  timestamptz,
  seg_finished_at timestamptz,
  reviewed_at    timestamptz,
  updated_at     timestamptz not null default now()
);

create index on map_pipeline_status (stage);

-- Keep updated_at current on every write
create or replace function map_pipeline_status_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger map_pipeline_status_updated_at
  before update on map_pipeline_status
  for each row execute procedure map_pipeline_status_set_updated_at();

-- Row-level security: admins only (matches footprint_submissions pattern)
alter table map_pipeline_status enable row level security;

create policy "service role full access"
  on map_pipeline_status
  using (true)
  with check (true);
