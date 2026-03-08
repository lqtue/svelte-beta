-- Migration 014: CDEC Records table for Vietnam War intelligence documents
-- Tracks processing of CDEC (Combined Document Exploitation Center) records

create table if not exists cdec_records (
  id                  uuid primary key default gen_random_uuid(),

  -- Document identification
  cdec_number         text unique,
  cdec_link           text,
  rec_id              text,
  log_number          text,

  -- Dates
  captured_date       date,
  captured_time       text,
  intel_date          date,
  report_date         date,

  -- Location fields
  location_text       text,
  mgrs_raw            text,
  mgrs_validated      text,
  coord_datum         text,
  coord_wgs84_lat     double precision,
  coord_wgs84_lon     double precision,

  -- Administrative location
  tactical_zone       text,
  province            text,
  district            text,
  village             text,
  location_other      text,

  -- Military units (NVA/VC naming system)
  unit_division       text,
  unit_brigade        text,
  unit_regiment       text,
  unit_battalion      text,
  unit_company        text,
  unit_platoon        text,
  unit_other          text,

  -- Military units (alternate naming system)
  unit2_division      text,
  unit2_brigade       text,
  unit2_regiment      text,
  unit2_battalion     text,
  unit2_company       text,
  unit2_platoon       text,
  unit2_other         text,

  -- Personnel
  person_name         text,
  person_alias        text,
  person_dob          text,
  person_hometown     text,
  person_father       text,
  person_mother       text,
  person_spouse       text,
  person_relatives    text,
  person_unit         text,
  person_enlist_year  text,

  -- Summary & analysis
  summary             text,
  family_info_current text,
  unit_info_current   text,
  vmai_info           text,
  monument_info       text,
  us_info             text,
  rvn_info            text,

  -- References & links
  ref_nara            text,
  ref_us_library      text,
  ref_vn_national_archive text,
  ref_vn_library      text,
  ref_provincial_archive text,
  ref_books           text,
  ref_internet        text,
  report_draft_link   text,
  photo_url           text,

  -- Workflow
  assigned_to         uuid references profiles(id) on delete set null,
  status              text not null default 'pending'
                      check (status in ('pending','in_review','validated','flagged','duplicate')),
  validator_1         uuid references profiles(id) on delete set null,
  validator_2         uuid references profiles(id) on delete set null,
  validated_at        timestamptz,
  notes               text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- updated_at trigger
create or replace function update_cdec_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cdec_records_updated_at on cdec_records;
create trigger cdec_records_updated_at
  before update on cdec_records
  for each row execute function update_cdec_updated_at();

-- Indexes
create index if not exists cdec_records_status_idx        on cdec_records (status);
create index if not exists cdec_records_assigned_to_idx   on cdec_records (assigned_to);
create index if not exists cdec_records_province_idx      on cdec_records (province);
create index if not exists cdec_records_cdec_number_idx   on cdec_records (cdec_number);
create index if not exists cdec_records_coord_idx         on cdec_records (coord_wgs84_lat, coord_wgs84_lon)
  where coord_wgs84_lat is not null and coord_wgs84_lon is not null;

-- RLS
alter table cdec_records enable row level security;

-- Admin: full access
create policy "admin_all" on cdec_records
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- vwai_member: select all records
create policy "vwai_member_select" on cdec_records
  for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'vwai_member')
    )
  );

-- vwai_member: update only their own assigned records
create policy "vwai_member_update_own" on cdec_records
  for update
  using (
    assigned_to = auth.uid()
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'vwai_member'
    )
  )
  with check (
    assigned_to = auth.uid()
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'vwai_member'
    )
  );

-- Storage bucket for CDEC photos (create if not exists)
insert into storage.buckets (id, name, public)
values ('cdec-photos', 'cdec-photos', false)
on conflict (id) do nothing;

-- Storage RLS for cdec-photos
create policy "cdec_photos_read" on storage.objects
  for select
  using (
    bucket_id = 'cdec-photos'
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'vwai_member')
    )
  );

create policy "cdec_photos_write" on storage.objects
  for insert
  with check (
    bucket_id = 'cdec-photos'
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'vwai_member')
    )
  );
