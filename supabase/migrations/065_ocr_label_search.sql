-- Migration 065 — search inside the maps: fuzzy label lookup over ocr_extractions
--
-- Labels are one to three words, OCR'd (typos), French and Vietnamese (accents).
-- Trigram word-similarity handles all three where tsvector handles none of them
-- on strings this short. `unaccent` is not immutable, so an immutable wrapper
-- is what the query goes through.
--
-- ponytail: no trigram index. The indexable operator (`<%`) reads its threshold
-- from `pg_trgm.word_similarity_threshold`, which Supabase's `postgres` role may
-- not SET on a function (permission denied — the GUC belongs to an extension
-- loaded in another schema), and the default 0.6 misses one-letter typos. An
-- explicit `word_similarity() >= 0.5` seq-scans instead: fine at the ~10⁵ rows a
-- fully OCR'd corpus will hold. If it ever hurts, have the dashboard run
-- `alter database postgres set pg_trgm.word_similarity_threshold = 0.5`, switch
-- the predicate to `<%`, and add `using gin (label_key(text, text_validated)
-- extensions.gin_trgm_ops)`.
--
-- Two other things move here because they are this feature's own trust
-- boundary:
--   * `ocr_extractions_read` was `using (true)` since 040, so the publishable
--     key could list every label on every draft map. It now inherits the map's
--     gate from migration 063 (published, or any signed-in user).
--   * `search_labels` is security definer, service_role only, and takes an
--     explicit `p_public_only` because /api/search runs on the service client
--     and already knows the caller's role.

create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

create or replace function public.f_unaccent(text)
returns text
language sql immutable parallel safe strict
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

-- The normalised label both sides of the comparison go through.
create or replace function public.label_key(p_text text, p_validated text)
returns text
language sql immutable parallel safe
as $$ select lower(public.f_unaccent(coalesce(p_validated, p_text))) $$;

-- ── read policy: inherit the map's visibility ────────────────────────────
drop policy if exists "ocr_extractions_read" on public.ocr_extractions;
drop policy if exists "ocr_extractions_read_published_or_authed" on public.ocr_extractions;
create policy "ocr_extractions_read_published_or_authed"
  on public.ocr_extractions for select
  using (
    auth.uid() is not null
    or exists (
      select 1 from public.maps m
       where m.id = ocr_extractions.map_id
         and m.status in ('public', 'featured')
    )
  );

-- ── search_labels ─────────────────────────────────────────────────────────
-- One row per (map, normalised label): the highest-confidence extraction wins
-- so a label OCR'd on three overlapping tiles shows once. Ordered by word
-- similarity, then confidence. Rejected rows and the legend/title furniture
-- are excluded — a legend entry names a class, not a place.
--
-- Threshold 0.5, measured on Saigon labels: 0.6 misses one-letter typos
-- ("khan hoy" → "khanh hoi" scores 0.55) and nothing unrelated scores above 0.35.
drop function if exists public.search_labels(text, boolean, integer);
create function public.search_labels(
  p_q           text,
  p_public_only boolean default true,
  p_limit       integer default 50
)
returns table (
  id          uuid,
  map_id      uuid,
  label       text,
  category    text,
  confidence  double precision,
  x           double precision,
  y           double precision,
  w           double precision,
  h           double precision,
  sim         real
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with q as (
    select lower(public.f_unaccent(btrim(p_q))) as key
  ),
  hits as (
    select distinct on (e.map_id, public.label_key(e.text, e.text_validated))
           e.id,
           e.map_id,
           coalesce(e.text_validated, e.text)                 as label,
           coalesce(e.category_validated, e.category)         as category,
           e.confidence,
           e.global_x, e.global_y, e.global_w, e.global_h,
           word_similarity(q.key, public.label_key(e.text, e.text_validated)) as sim
      from public.ocr_extractions e
      join public.maps m on m.id = e.map_id
      cross join q
     where length(q.key) >= 2
       and word_similarity(q.key, public.label_key(e.text, e.text_validated)) >= 0.5
       and e.status <> 'rejected'
       and coalesce(e.category_validated, e.category)
           in ('street', 'hydrology', 'place', 'building', 'institution')
       and e.global_x is not null
       and (not p_public_only or m.status in ('public', 'featured'))
     order by e.map_id, public.label_key(e.text, e.text_validated), e.confidence desc
  )
  select id, map_id, label, category, confidence,
         global_x, global_y, global_w, global_h, sim
    from hits
   order by sim desc, confidence desc
   limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.search_labels(text, boolean, integer) from public, anon, authenticated;
grant execute on function public.search_labels(text, boolean, integer) to service_role;
