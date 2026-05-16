-- Scout candidates: discovered Vietnam/Indochina maps from external sources
-- (Gallica, BnF, Humazur, David Rumsey, LoC, etc.) awaiting review before
-- being ingested into the `maps` catalogue.
--
-- Lifecycle: pending → approved → ingested  (or → rejected)
-- Once status='ingested', a corresponding maps row exists; map_id stores it.

create table if not exists scout_candidates (
  id uuid primary key default gen_random_uuid(),
  -- Provenance
  source text not null,                    -- gallica | humazur | rumsey | loc | ...
  external_id text not null,               -- ARK, Rumsey ID, Omeka item ID, etc.
  source_url text,
  manifest_url text,
  -- Display
  title text not null,
  creator text,
  publisher text,
  date text,                               -- raw date string from source
  year int,                                -- parsed year (best effort)
  rights text,
  language text,
  holding_institution text,
  collection text,                         -- archival sub-collection
  thumbnail text,
  -- Categorization
  score int not null default 0,
  category text,                           -- urban_plan | topographic | cadastral | regional | photo | route_road | route_railway | atlas_plate | world | unknown | non_cartographic
  reasons text,                            -- categorization reasons (debug)
  found_via text,                          -- search keywords that matched
  -- Lifecycle
  status text not null default 'pending'   -- pending | approved | rejected | ingested
    check (status in ('pending', 'approved', 'rejected', 'ingested')),
  reviewer_id uuid references auth.users(id),
  reviewed_at timestamptz,
  map_id uuid references maps(id),         -- set after ingestion
  -- Raw payload (for re-ingestion / debug)
  raw jsonb,
  -- Audit
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists idx_scout_status on scout_candidates (status);
create index if not exists idx_scout_score_desc on scout_candidates (score desc);
create index if not exists idx_scout_source on scout_candidates (source);
create index if not exists idx_scout_category on scout_candidates (category);

-- RLS: admin/mod only
alter table scout_candidates enable row level security;

create policy "Admins can view scout candidates"
  on scout_candidates for select
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','mod'))
  );

create policy "Admins can update scout candidates"
  on scout_candidates for update
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','mod'))
  );

create policy "Service role can insert"
  on scout_candidates for insert
  with check (true);

comment on table scout_candidates is
  'Map records discovered via external scout (Gallica/BnF/Humazur/Rumsey/LoC) awaiting human review before being promoted to maps.';
