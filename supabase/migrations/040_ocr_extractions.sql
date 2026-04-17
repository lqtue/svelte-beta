-- OCR extractions from Gemini vision pipeline
-- Stores per-tile label extractions keyed by map + run + tile coords.
-- Feeds kg_entities and label_pins pre-population.

create table if not exists ocr_extractions (
  id            uuid primary key default gen_random_uuid(),
  map_id        uuid not null references maps(id) on delete cascade,
  run_id        text not null,
  tile_x        integer not null,
  tile_y        integer not null,
  tile_w        integer not null,
  tile_h        integer not null,
  -- global pixel coords in source image (converted from 0-1000 normalized tile space)
  global_x      double precision,
  global_y      double precision,
  global_w      double precision,
  global_h      double precision,
  -- extraction fields
  category      text not null,   -- street|place|building|institution|legend|title|other
  text          text not null,
  confidence    double precision not null default 0,
  rotation_deg  double precision,
  notes         text,
  model         text,
  prompt        text,
  created_at    timestamptz not null default now()
);

-- Partial unique index: one extraction per (map, run, tile, text) to allow upsert
create unique index ocr_extractions_upsert_key
  on ocr_extractions (map_id, run_id, tile_x, tile_y, text);

create index ocr_extractions_map_run on ocr_extractions (map_id, run_id);
create index ocr_extractions_category on ocr_extractions (map_id, category);

-- RLS
alter table ocr_extractions enable row level security;

-- Public read (OCR results are not sensitive)
create policy "ocr_extractions_read"
  on ocr_extractions for select
  using (true);

-- Insert/update restricted to service role (pipeline writes via service key)
create policy "ocr_extractions_service_write"
  on ocr_extractions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
