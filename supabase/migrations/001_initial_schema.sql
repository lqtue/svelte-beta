-- ============================================================
-- Vietnam Map Archive — Initial Supabase Schema
-- ============================================================


-- 1. Profiles table (must come first — referenced by maps policies)
-- ============================================================

create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  role         text default 'user' check (role in ('admin', 'user')),
  display_name text,
  created_at   timestamptz default now()
);

alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update their own profile (but not role)
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 2. Maps table (replaces Google Sheets CSV)
-- ============================================================

create table if not exists public.maps (
  id          uuid primary key default gen_random_uuid(),
  allmaps_id   text unique not null,
  name        text not null,
  type        text,
  summary     text,
  description text,
  thumbnail   text,
  is_featured boolean default false,
  year        integer,
  created_at  timestamptz default now()
);

create index idx_maps_allmaps_id on public.maps (allmaps_id);

alter table public.maps enable row level security;

-- Everyone can read maps
create policy "maps_select_all"
  on public.maps for select
  using (true);

-- Only admins can modify maps
create policy "maps_insert_admin"
  on public.maps for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "maps_update_admin"
  on public.maps for update
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "maps_delete_admin"
  on public.maps for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );


-- 3. Hunts table
-- ============================================================

create table if not exists public.hunts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  title       text not null,
  description text,
  region      jsonb,
  is_public   boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index idx_hunts_user_id on public.hunts (user_id);

alter table public.hunts enable row level security;

-- Users can read public hunts or their own
create policy "hunts_select"
  on public.hunts for select
  using (is_public = true or user_id = auth.uid());

-- Users can insert their own hunts
create policy "hunts_insert_own"
  on public.hunts for insert
  with check (user_id = auth.uid());

-- Users can update their own hunts
create policy "hunts_update_own"
  on public.hunts for update
  using (user_id = auth.uid());

-- Users can delete their own hunts
create policy "hunts_delete_own"
  on public.hunts for delete
  using (user_id = auth.uid());


-- 4. Hunt stops table
-- ============================================================

create table if not exists public.hunt_stops (
  id              uuid primary key default gen_random_uuid(),
  hunt_id         uuid not null references public.hunts on delete cascade,
  sort_order      integer not null,
  title           text not null,
  description     text,
  hint            text,
  quest           text,
  lon             float8 not null,
  lat             float8 not null,
  trigger_radius  integer default 10,
  interaction     text default 'proximity',
  qr_payload      text,
  overlay_map_id  text
);

create index idx_hunt_stops_hunt_id on public.hunt_stops (hunt_id);

alter table public.hunt_stops enable row level security;

-- Follows parent hunt access
create policy "hunt_stops_select"
  on public.hunt_stops for select
  using (
    exists (
      select 1 from public.hunts
      where hunts.id = hunt_stops.hunt_id
        and (hunts.is_public = true or hunts.user_id = auth.uid())
    )
  );

create policy "hunt_stops_insert_own"
  on public.hunt_stops for insert
  with check (
    exists (
      select 1 from public.hunts
      where hunts.id = hunt_stops.hunt_id
        and hunts.user_id = auth.uid()
    )
  );

create policy "hunt_stops_update_own"
  on public.hunt_stops for update
  using (
    exists (
      select 1 from public.hunts
      where hunts.id = hunt_stops.hunt_id
        and hunts.user_id = auth.uid()
    )
  );

create policy "hunt_stops_delete_own"
  on public.hunt_stops for delete
  using (
    exists (
      select 1 from public.hunts
      where hunts.id = hunt_stops.hunt_id
        and hunts.user_id = auth.uid()
    )
  );


-- 5. Hunt progress table
-- ============================================================

create table if not exists public.hunt_progress (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  hunt_id            uuid not null references public.hunts on delete cascade,
  current_stop_index integer default 0,
  completed_stops    text[] default '{}',
  started_at         timestamptz default now(),
  completed_at       timestamptz,
  unique (user_id, hunt_id)
);

alter table public.hunt_progress enable row level security;

-- Users can only see their own progress
create policy "hunt_progress_select_own"
  on public.hunt_progress for select
  using (user_id = auth.uid());

create policy "hunt_progress_insert_own"
  on public.hunt_progress for insert
  with check (user_id = auth.uid());

create policy "hunt_progress_update_own"
  on public.hunt_progress for update
  using (user_id = auth.uid());
