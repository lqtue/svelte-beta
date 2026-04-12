-- ============================================================
-- Migration 038 — Open contribution model
--
-- Removes:  label_tasks, georef_submissions, pinned_sections
-- Creates:  legend_submissions, metadata_submissions, map_help_requests
-- Updates:  maps (visibility, priority, label_config, progress flags)
--           label_pins (map_id direct, drop task_id)
--           footprint_submissions (drop task_id/pin_id, fix status)
--           profiles.role: cataloger → mod
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. maps — add open-contribution columns
-- ────────────────────────────────────────────────────────────

alter table public.maps
  add column if not exists created_by   uuid references auth.users(id) on delete set null,
  add column if not exists is_public    boolean not null default false,
  add column if not exists priority     integer not null default 0,
  add column if not exists label_config jsonb   not null default '{}',
  add column if not exists georef_done  boolean not null default false,
  add column if not exists legend_done  boolean not null default false,
  add column if not exists help_needed  boolean not null default false;

comment on column public.maps.priority     is 'Admin-set contribution priority. Higher = more urgent in /contribute queue.';
comment on column public.maps.label_config is 'Populated from canonical legend_submission. { legend: [...], categories: [...] }';
comment on column public.maps.georef_done  is 'True when allmaps_id is set (georef complete on Allmaps externally).';
comment on column public.maps.legend_done  is 'True when a canonical legend_submission exists.';
comment on column public.maps.help_needed  is 'True when any open map_help_request exists. Maintained by trigger.';

-- Backfill georef_done
update public.maps set georef_done = true where allmaps_id is not null;

-- Backfill label_config from label_tasks
update public.maps m
  set label_config = jsonb_build_object(
    'legend',     coalesce(lt.legend,      '[]'::jsonb),
    'categories', coalesce(lt.categories,  '[]'::jsonb)
  )
from public.label_tasks lt
where lt.map_id = m.id
  and (lt.legend is not null or lt.categories is not null);

-- Migrate maps.status to new values
-- Old: pending_georef | georeferenced | processing | published | null
-- New: draft | public | featured
alter table public.maps drop constraint if exists maps_status_check;

update public.maps set status = 'public'   where status = 'published';
update public.maps set status = 'draft'
  where status in ('pending_georef', 'georeferenced', 'processing')
     or status is null;

-- is_public mirrors published state
update public.maps set is_public = true where status in ('public', 'featured');
update public.maps set is_public = true where is_featured = true;

alter table public.maps
  add constraint maps_status_check
    check (status in ('draft', 'public', 'featured'));

comment on column public.maps.status is
  'Publication state. draft = user workspace, public = community visible, featured = admin-curated highlight. Admin-only to set public/featured.';

-- Update maps RLS — open insert for any auth user, restrict publish to mod/admin
drop policy if exists "maps_insert_admin"  on public.maps;
drop policy if exists "maps_update_admin"  on public.maps;
drop policy if exists "maps_delete_admin"  on public.maps;

-- Any logged-in user can add a map
create policy "maps_insert_auth"
  on public.maps for insert
  with check (auth.uid() is not null);

-- User can edit their own draft; mod/admin can edit any
create policy "maps_update_own_or_mod"
  on public.maps for update
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('mod', 'admin')
    )
  );

-- Only admin can delete
create policy "maps_delete_admin"
  on public.maps for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ────────────────────────────────────────────────────────────
-- 2. legend_submissions
-- ────────────────────────────────────────────────────────────

create table if not exists public.legend_submissions (
  id           uuid primary key default gen_random_uuid(),
  map_id       uuid not null references public.maps(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  legend_type  text not null default 'color_key'
                 check (legend_type in ('color_key', 'street_index', 'building_index')),
  entries      jsonb not null default '[]',
  is_canonical boolean not null default false,
  admin_notes  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.legend_submissions is
  'User-digitized versions of a map''s printed legend. is_canonical=true drives maps.label_config and sets maps.legend_done.';
comment on column public.legend_submissions.entries is
  'color_key: [{ number, name, color, type }]. street_index: [{ name, grid_ref }]. building_index: [{ number, name, type }]';

-- Sync canonical legend → maps.label_config + maps.legend_done
create or replace function public.sync_canonical_legend()
returns trigger language plpgsql as $$
begin
  if new.is_canonical = true and (old.is_canonical = false or old.is_canonical is null) then
    -- Unset other canonical submissions for this map
    update public.legend_submissions
      set is_canonical = false
      where map_id = new.map_id and id != new.id and is_canonical = true;

    -- Sync to maps
    update public.maps
      set label_config = jsonb_build_object(
            'legend', new.entries,
            'categories', coalesce(
              (select jsonb_agg(distinct entry->>'type')
               from jsonb_array_elements(new.entries) as entry
               where entry->>'type' is not null),
              '[]'::jsonb
            )
          ),
          legend_done = true
      where id = new.map_id;
  end if;
  return new;
end;
$$;

create or replace trigger legend_submissions_canonical
  after update on public.legend_submissions
  for each row execute function public.sync_canonical_legend();

create or replace function public.legend_submissions_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace trigger legend_submissions_updated_at
  before update on public.legend_submissions
  for each row execute function public.legend_submissions_set_updated_at();

create index if not exists idx_legend_submissions_map
  on public.legend_submissions(map_id);

alter table public.legend_submissions enable row level security;

create policy "legend_submissions_select"
  on public.legend_submissions for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.maps
      where id = map_id and (is_public = true or status in ('public', 'featured'))
    )
  );

create policy "legend_submissions_insert"
  on public.legend_submissions for insert
  with check (auth.uid() is not null and user_id = auth.uid());

create policy "legend_submissions_update_own_or_mod"
  on public.legend_submissions for update
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('mod', 'admin'))
  );

create policy "legend_submissions_delete_own_or_admin"
  on public.legend_submissions for delete
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ────────────────────────────────────────────────────────────
-- 3. metadata_submissions
-- ────────────────────────────────────────────────────────────

create table if not exists public.metadata_submissions (
  id           uuid primary key default gen_random_uuid(),
  map_id       uuid not null references public.maps(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  fields       jsonb not null default '{}',
  is_canonical boolean not null default false,
  admin_notes  text,
  created_at   timestamptz not null default now()
);

comment on table public.metadata_submissions is
  'User-submitted metadata for a map. Partial submissions are fine — only present keys are applied. is_canonical=true syncs fields to maps row.';
comment on column public.metadata_submissions.fields is
  'Subset of maps columns: year, location, creator, dc_description, collection, source_url, original_title, shelfmark, rights, physical_description.';

create or replace function public.sync_canonical_metadata()
returns trigger language plpgsql as $$
declare f jsonb;
begin
  if new.is_canonical = true and (old.is_canonical = false or old.is_canonical is null) then
    f := new.fields;

    update public.metadata_submissions
      set is_canonical = false
      where map_id = new.map_id and id != new.id and is_canonical = true;

    update public.maps set
      year                 = coalesce((f->>'year')::int,           year),
      location             = coalesce(f->>'location',              location),
      creator              = coalesce(f->>'creator',               creator),
      dc_description       = coalesce(f->>'dc_description',        dc_description),
      collection           = coalesce(f->>'collection',            collection),
      source_url           = coalesce(f->>'source_url',            source_url),
      original_title       = coalesce(f->>'original_title',        original_title),
      shelfmark            = coalesce(f->>'shelfmark',             shelfmark),
      rights               = coalesce(f->>'rights',                rights),
      physical_description = coalesce(f->>'physical_description',  physical_description)
    where id = new.map_id;
  end if;
  return new;
end;
$$;

create or replace trigger metadata_submissions_canonical
  after update on public.metadata_submissions
  for each row execute function public.sync_canonical_metadata();

create index if not exists idx_metadata_submissions_map
  on public.metadata_submissions(map_id);

alter table public.metadata_submissions enable row level security;

create policy "metadata_submissions_select"
  on public.metadata_submissions for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.maps
      where id = map_id and (is_public = true or status in ('public', 'featured'))
    )
  );

create policy "metadata_submissions_insert"
  on public.metadata_submissions for insert
  with check (auth.uid() is not null and user_id = auth.uid());

create policy "metadata_submissions_update_own_or_mod"
  on public.metadata_submissions for update
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('mod', 'admin'))
  );

create policy "metadata_submissions_delete_own_or_admin"
  on public.metadata_submissions for delete
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ────────────────────────────────────────────────────────────
-- 4. map_help_requests
-- ────────────────────────────────────────────────────────────

create table if not exists public.map_help_requests (
  id           uuid primary key default gen_random_uuid(),
  map_id       uuid not null references public.maps(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  help_type    text not null default 'other'
                 check (help_type in ('georef', 'legend', 'label', 'trace', 'metadata', 'other')),
  message      text not null,
  status       text not null default 'open'
                 check (status in ('open', 'resolved')),
  mod_response text,
  created_at   timestamptz not null default now()
);

comment on table public.map_help_requests is
  'User help requests on a specific map step. Mod responds via mod_response and sets status=resolved. Drives maps.help_needed flag.';
comment on column public.map_help_requests.status is
  'Lifecycle: open → resolved';

-- Sync maps.help_needed
create or replace function public.sync_map_help_needed()
returns trigger language plpgsql as $$
declare target_map_id uuid;
begin
  target_map_id := coalesce(new.map_id, old.map_id);
  update public.maps
    set help_needed = exists (
      select 1 from public.map_help_requests
      where map_id = target_map_id and status = 'open'
    )
  where id = target_map_id;
  return coalesce(new, old);
end;
$$;

create or replace trigger map_help_requests_sync_help_needed
  after insert or update or delete on public.map_help_requests
  for each row execute function public.sync_map_help_needed();

create index if not exists idx_map_help_requests_map
  on public.map_help_requests(map_id);
create index if not exists idx_map_help_requests_status
  on public.map_help_requests(status);

alter table public.map_help_requests enable row level security;

-- Users see their own; mods/admins see all
create policy "map_help_requests_select"
  on public.map_help_requests for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('mod', 'admin'))
  );

create policy "map_help_requests_insert"
  on public.map_help_requests for insert
  with check (auth.uid() is not null and user_id = auth.uid());

-- Mod responds; user can close their own
create policy "map_help_requests_update"
  on public.map_help_requests for update
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('mod', 'admin'))
  );

-- ────────────────────────────────────────────────────────────
-- 5. label_pins — add map_id direct, drop task_id
-- ────────────────────────────────────────────────────────────

-- Add map_id (nullable for backfill)
alter table public.label_pins
  add column if not exists map_id uuid references public.maps(id) on delete cascade;

-- Backfill from label_tasks
update public.label_pins lp
  set map_id = lt.map_id
from public.label_tasks lt
where lt.id = lp.task_id;

-- Drop orphaned pins with no resolvable map
delete from public.label_pins where map_id is null;

-- Enforce not null
alter table public.label_pins alter column map_id set not null;

-- Drop old task_id FK + column
alter table public.label_pins drop constraint if exists label_pins_task_id_fkey;
alter table public.label_pins drop column if exists task_id;

-- Update indexes
drop index if exists idx_label_pins_task;
create index if not exists idx_label_pins_map on public.label_pins(map_id);

-- Update RLS
drop policy if exists "label_pins_read"   on public.label_pins;
drop policy if exists "label_pins_insert" on public.label_pins;
drop policy if exists "label_pins_delete" on public.label_pins;
drop policy if exists "label_pins_update" on public.label_pins;

create policy "label_pins_select"
  on public.label_pins for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.maps
      where id = map_id and (is_public = true or status in ('public', 'featured'))
    )
  );

create policy "label_pins_insert"
  on public.label_pins for insert
  with check (auth.uid() is not null and user_id = auth.uid());

create policy "label_pins_update_own"
  on public.label_pins for update
  using (user_id = auth.uid());

create policy "label_pins_delete_own"
  on public.label_pins for delete
  using (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- 6. footprint_submissions — drop task_id, pin_id; fix status
-- ────────────────────────────────────────────────────────────

alter table public.footprint_submissions
  drop constraint if exists footprint_submissions_task_id_fkey,
  drop constraint if exists footprint_submissions_pin_id_fkey;

alter table public.footprint_submissions
  drop column if exists task_id,
  drop column if exists pin_id;

-- Fix status: drop needs_review/consensus/verified, use draft/submitted/approved/rejected
alter table public.footprint_submissions
  drop constraint if exists footprint_submissions_status_check;

update public.footprint_submissions
  set status = 'submitted'
  where status in ('needs_review', 'consensus', 'verified');

alter table public.footprint_submissions
  add constraint footprint_submissions_status_check
    check (status in ('draft', 'submitted', 'approved', 'rejected'));

comment on column public.footprint_submissions.status is
  'Lifecycle: draft → submitted → approved | rejected. Manual traces auto-enter as submitted. SAM traces will use approved/rejected in future review workflow.';

-- Update footprint RLS
drop policy if exists "footprints_read"           on public.footprint_submissions;
drop policy if exists "footprints_insert"         on public.footprint_submissions;
drop policy if exists "footprints_delete"         on public.footprint_submissions;
drop policy if exists "footprints_service_update" on public.footprint_submissions;
drop policy if exists "footprints_update_own"     on public.footprint_submissions;

create policy "footprints_select"
  on public.footprint_submissions for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.maps
      where id = map_id and (is_public = true or status in ('public', 'featured'))
    )
  );

create policy "footprints_insert"
  on public.footprint_submissions for insert
  with check (auth.uid() is not null);

create policy "footprints_update_own_or_mod"
  on public.footprint_submissions for update
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('mod', 'admin'))
  );

create policy "footprints_delete_own_or_admin"
  on public.footprint_submissions for delete
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ────────────────────────────────────────────────────────────
-- 7. Drop dead tables
-- ────────────────────────────────────────────────────────────

drop table if exists public.pinned_sections;
drop table if exists public.georef_submissions;
drop table if exists public.label_tasks;  -- after backfill above

-- ────────────────────────────────────────────────────────────
-- 8. profiles.role — cataloger → mod
-- ────────────────────────────────────────────────────────────

alter table public.profiles
  drop constraint if exists profiles_role_check;

update public.profiles
  set role = 'mod'
  where role = 'cataloger';

alter table public.profiles
  add constraint profiles_role_check
    check (role in ('admin', 'mod', 'user'));

comment on column public.profiles.role is
  'null/user = any logged-in contributor. mod = can mark canonical submissions, respond to help requests. admin = full access + publish maps.';
