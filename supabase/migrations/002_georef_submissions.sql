-- ============================================================
-- Georef Submissions — Crowdsourced georeferencing workflow
-- ============================================================

create table if not exists public.georef_submissions (
  id            uuid primary key default gen_random_uuid(),
  iiif_url      text not null,
  name          text not null,
  description   text,
  status        text default 'open' check (status in ('open', 'in_progress', 'review_needed', 'approved', 'rejected')),
  submitted_by  uuid references auth.users on delete set null,
  allmaps_id     text,
  admin_notes   text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_georef_submissions_status on public.georef_submissions (status);

alter table public.georef_submissions enable row level security;

-- Everyone can read submissions (public listing)
create policy "georef_select_all"
  on public.georef_submissions for select
  using (true);

-- Only admins can insert new submissions
create policy "georef_insert_admin"
  on public.georef_submissions for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Authenticated users can update open/in_progress rows (claim & submit);
-- admins can update any row
create policy "georef_update"
  on public.georef_submissions for update
  using (
    -- admins can update anything
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
    or
    -- authenticated users can update open/in_progress rows
    (auth.uid() is not null and status in ('open', 'in_progress'))
  );

-- Only admins can delete
create policy "georef_delete_admin"
  on public.georef_submissions for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
