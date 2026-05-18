-- 047_split_allmaps_id.sql
--
-- Disambiguate maps.allmaps_id by splitting it into two columns:
--   • allmaps_id      — the 16-char Allmaps image ID (computed from canonical
--                       IIIF service URL via @allmaps/id). Always a bare ID;
--                       NULL when not yet derived.
--   • annotation_url  — optional override pointing at the W3C Georeference
--                       Annotation JSON. Set by the mirror-r2 flow to the
--                       Supabase Storage URL of the rewritten annotation.
--                       NULL means: build the URL from `allmaps_id` via
--                       https://annotations.allmaps.org/images/{allmaps_id}.
--
-- Backfill strategy: rows whose `allmaps_id` looks like a URL (starts with
-- http) are moved to `annotation_url`, and `allmaps_id` is cleared. Those
-- maps will need a separate Node backfill pass (scripts/backfill_allmaps_ids.mjs)
-- to re-derive the bare ID from their current IIIF image URL.

alter table maps
  add column if not exists annotation_url text;

update maps
   set annotation_url = allmaps_id,
       allmaps_id     = null
 where allmaps_id is not null
   and allmaps_id ~ '^https?://';

comment on column maps.allmaps_id     is '16-char Allmaps image ID (from @allmaps/id over canonical IIIF URL). Build annotation URL as https://annotations.allmaps.org/images/{id} unless annotation_url is set.';
comment on column maps.annotation_url is 'Optional override URL to the W3C Georeference Annotation JSON. Set by mirror-r2 to the Supabase Storage URL. Takes precedence over allmaps_id when present.';
