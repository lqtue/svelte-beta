-- Allow reading profiles for users who have published stories
-- This enables showing author names on public story cards

create policy "profiles_select_public_authors"
  on public.profiles for select
  using (
    exists (
      select 1 from public.hunts
      where hunts.user_id = profiles.id
        and hunts.is_public = true
    )
  );
