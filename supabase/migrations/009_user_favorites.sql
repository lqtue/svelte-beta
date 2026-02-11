create table if not exists public.user_favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  map_id     text not null,
  created_at timestamptz default now(),
  unique(user_id, map_id)
);

create index idx_user_favorites_user on public.user_favorites(user_id);

alter table public.user_favorites enable row level security;

create policy "Users can read own favorites" on public.user_favorites for select using (auth.uid() = user_id);
create policy "Users can insert own favorites" on public.user_favorites for insert with check (auth.uid() = user_id);
create policy "Users can delete own favorites" on public.user_favorites for delete using (auth.uid() = user_id);
