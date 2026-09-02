-- Migration 067 — the gazetteer: one row per attested place name
--
-- E1 made labels searchable one at a time. This groups them: every spelling a
-- place was written with, every year it is attested, every sheet it appears on,
-- and where it sits on the ground. That is what makes "this street had three
-- names under three regimes" answerable, and it gives /api/press every real
-- spelling of a name instead of the three forms the query builder guesses.
--
-- A view, not a table. The grouping is cheap, the source rows are the master,
-- and a materialised copy would need a refresh policy nobody would maintain.
--
-- `security_invoker = true` is the whole access story: the view inherits
-- migration 065's read policy on ocr_extractions, so an anonymous caller sees
-- names from published maps only, and a signed-in contributor sees drafts too.
-- Without it a view runs as its owner and would leak every draft name.

-- `label_key` (migration 065) lowercases and strips accents, which is the right
-- normalisation for fuzzy *search*. It is not enough for *grouping*: measured on
-- the corpus, "Rue de Khanh Hoi" and "Rue de Khánh-Hội" are the same street
-- written two ways, and they differ only by a hyphen. This key also folds every
-- run of non-alphanumerics into one space, so those two collapse into one
-- gazetteer entry. Search keeps `label_key`, whose trigram similarity already
-- tolerates punctuation — a stricter key there would change match scores.
create or replace function public.place_key(p_text text, p_validated text)
returns text
language sql immutable parallel safe
as $$
  select nullif(btrim(regexp_replace(
           public.label_key(p_text, p_validated), '[^a-z0-9]+', ' ', 'g')), '')
$$;

create or replace view public.place_names
with (security_invoker = true)
as
  select
    public.place_key(e.text, e.text_validated)                           as name_key,
    -- The most-attested spelling is the display name: whichever form the
    -- corpus writes most often is the one a reader is most likely to recognise.
    mode() within group (order by coalesce(e.text_validated, e.text))    as name,
    array_agg(distinct coalesce(e.text_validated, e.text))               as variants,
    array_remove(array_agg(distinct m.year), null)                       as years,
    min(m.year)                                                          as first_year,
    max(m.year)                                                          as last_year,
    array_agg(distinct e.map_id)                                         as map_ids,
    count(*)                                                             as mentions,
    mode() within group (order by coalesce(e.category_validated, e.category)) as category,
    -- One representative position: the centroid of everything warped under this
    -- name. Null while nothing has been warped, which is honest rather than 0,0.
    st_y(st_centroid(st_collect(e.geom::geometry))::geometry)            as lat,
    st_x(st_centroid(st_collect(e.geom::geometry))::geometry)            as lng,
    max(e.geom_rmse)                                                     as geom_rmse
    from public.ocr_extractions e
    join public.maps m on m.id = e.map_id
   where e.status <> 'rejected'
     and coalesce(e.category_validated, e.category)
         in ('street', 'hydrology', 'place', 'building', 'institution')
     and length(public.place_key(e.text, e.text_validated)) >= 2
   group by public.place_key(e.text, e.text_validated);

comment on view public.place_names is
  'Gazetteer of attested place names, grouped from ocr_extractions. security_invoker, so draft maps stay gated by migration 065.';

grant select on public.place_names to anon, authenticated, service_role;
