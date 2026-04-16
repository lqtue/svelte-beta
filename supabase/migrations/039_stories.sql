-- ============================================================
-- Migration 039 — Stories
--
-- Rebuilds story/hunt tables dropped in migration 034.
-- Clean schema aligned with db-guidelines:
--   user_id (not author_id), snake_case, uuid PKs, proper RLS.
--
-- Tables: stories, story_points, story_progress
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. stories
-- ────────────────────────────────────────────────────────────

create table if not exists public.stories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  title       text not null,
  description text,
  mode        text not null default 'guided'
                check (mode in ('guided', 'adventure')),
  region      jsonb not null default '{}',
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  public.stories             is 'User-authored guided tours or adventure trails anchored to historical maps.';
comment on column public.stories.mode        is 'guided = linear waypoint tour. adventure = open exploration with challenges.';
comment on column public.stories.region      is 'Default map viewport: { center: [lon, lat], zoom: number }.';

create or replace function public.stories_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace trigger stories_updated_at
  before update on public.stories
  for each row execute function public.stories_set_updated_at();

create index if not exists idx_stories_user   on public.stories(user_id);
create index if not exists idx_stories_public on public.stories(is_public) where is_public = true;

alter table public.stories enable row level security;

create policy "stories_select"
  on public.stories for select
  using (is_public = true or user_id = auth.uid());

create policy "stories_insert"
  on public.stories for insert
  with check (auth.uid() is not null and user_id = auth.uid());

create policy "stories_update_own"
  on public.stories for update
  using (user_id = auth.uid());

create policy "stories_delete_own"
  on public.stories for delete
  using (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────
-- 2. story_points
-- ────────────────────────────────────────────────────────────

create table if not exists public.story_points (
  id             uuid primary key default gen_random_uuid(),
  story_id       uuid not null references public.stories(id) on delete cascade,
  sort_order     integer not null default 0,
  title          text not null,
  description    text,
  hint           text,
  quest          text,
  lon            double precision not null,
  lat            double precision not null,
  trigger_radius integer not null default 10,
  interaction    text not null default 'proximity'
                   check (interaction in ('proximity', 'qr', 'camera')),
  challenge      jsonb not null default '{"type":"none"}',
  qr_payload     text,
  overlay_map_id uuid references public.maps(id) on delete set null,
  camera         jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

comment on table  public.story_points                 is 'Waypoints belonging to a story, ordered by sort_order.';
comment on column public.story_points.lon             is 'EPSG:4326 longitude.';
comment on column public.story_points.lat             is 'EPSG:4326 latitude.';
comment on column public.story_points.trigger_radius  is 'Proximity trigger radius in metres (interaction=proximity).';
comment on column public.story_points.challenge       is '{ type: none|question|reach, question?, answer?, triggerRadius? }';
comment on column public.story_points.camera          is 'Saved viewport: { center: [lon, lat], zoom, rotation? }. Empty = use point coords.';

create index if not exists idx_story_points_story on public.story_points(story_id);

alter table public.story_points enable row level security;

create policy "story_points_select"
  on public.story_points for select
  using (
    exists (
      select 1 from public.stories
      where id = story_id and (is_public = true or user_id = auth.uid())
    )
  );

create policy "story_points_insert"
  on public.story_points for insert
  with check (
    auth.uid() is not null and
    exists (select 1 from public.stories where id = story_id and user_id = auth.uid())
  );

create policy "story_points_update_own"
  on public.story_points for update
  using (
    exists (select 1 from public.stories where id = story_id and user_id = auth.uid())
  );

create policy "story_points_delete_own"
  on public.story_points for delete
  using (
    exists (select 1 from public.stories where id = story_id and user_id = auth.uid())
  );


-- ────────────────────────────────────────────────────────────
-- 3. story_progress
-- ────────────────────────────────────────────────────────────

create table if not exists public.story_progress (
  id                  uuid primary key default gen_random_uuid(),
  story_id            uuid not null references public.stories(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  current_point_index integer not null default 0,
  completed_points    uuid[] not null default '{}',
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,
  updated_at          timestamptz not null default now(),
  unique (story_id, user_id)
);

comment on table  public.story_progress                  is 'Per-user progress through a story. One row per (story, user) pair.';
comment on column public.story_progress.completed_points is 'Array of story_points.id values the user has reached.';

create or replace function public.story_progress_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace trigger story_progress_updated_at
  before update on public.story_progress
  for each row execute function public.story_progress_set_updated_at();

create index if not exists idx_story_progress_user  on public.story_progress(user_id);
create index if not exists idx_story_progress_story on public.story_progress(story_id);

alter table public.story_progress enable row level security;

create policy "story_progress_select_own"
  on public.story_progress for select
  using (user_id = auth.uid());

create policy "story_progress_insert"
  on public.story_progress for insert
  with check (auth.uid() is not null and user_id = auth.uid());

create policy "story_progress_update_own"
  on public.story_progress for update
  using (user_id = auth.uid());

create policy "story_progress_delete_own"
  on public.story_progress for delete
  using (user_id = auth.uid());
