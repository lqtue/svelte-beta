create table if not exists public.iiif_migrations (
  id              uuid primary key default gen_random_uuid(),
  map_id          uuid not null references public.maps(id) on delete cascade,
  map_name        text not null,
  old_allmaps_id   text not null,
  new_allmaps_id   text,
  old_iiif_url     text not null,
  new_iiif_url     text,
  ia_identifier    text,
  ia_filename      text,
  status          text default 'pending'
                  check (status in ('pending','uploaded','iiif_ready','annotation_posted','complete','error')),
  error_message   text,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique(map_id)
);

alter table public.iiif_migrations enable row level security;
-- Admin-only RLS policies for select/insert/update/delete
