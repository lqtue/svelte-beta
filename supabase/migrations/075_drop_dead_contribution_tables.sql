-- 075_drop_dead_contribution_tables.sql
--
-- Four tables that never took a row and have no code left that writes them.
--
--   legend_submissions, metadata_submissions, map_help_requests  (mig 038)
--     The open-contribution model shipped the tables and the sync triggers, but
--     the write paths were removed with the route merge. Nothing in src/ names
--     them; the community contributions that do arrive go through
--     footprint_submissions and stories.
--   story_progress                                              (mig 039)
--     Per-user tour progress. /trip/[id] keeps its state in localStorage
--     (vma-story-player-v1), so this has been a spare table since day one.
--
-- `cascade` takes the RLS policies, indexes and triggers with each table; the
-- trigger functions are named separately because they are not table-owned.
--
-- Kept on purpose:
--   user_favorites   — also 0 rows, but data/supabase/favorites.ts reads and
--                      writes it. Empty is "no one has starred a map yet", not
--                      dead schema.
--   maps.ia_identifier / legend_done / help_needed
--                    — all null / all false today, but MapEditModal, mapFields
--                      and mapEditPayload are wired to them. Dropping these is
--                      a code change, not a cleanup.

drop table if exists public.legend_submissions cascade;
drop table if exists public.metadata_submissions cascade;
drop table if exists public.map_help_requests cascade;
drop table if exists public.story_progress cascade;

drop function if exists public.sync_canonical_legend();
drop function if exists public.legend_submissions_set_updated_at();
drop function if exists public.sync_canonical_metadata();
drop function if exists public.sync_map_help_needed();
drop function if exists public.story_progress_set_updated_at();
