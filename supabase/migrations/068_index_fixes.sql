-- Migration 068 — four fixes to the place-time index, found in review
--
-- 1. `context_at` sorted its result arrays by `distance_m` as **text**, so
--    "104.6" came before "12.3". The inner query picked the right rows; the
--    outer aggregation handed them back in nonsense order. The story bucket was
--    worse: `order by 1` ordered by the jsonb blob itself, so its limit could
--    discard nearer points in favour of farther ones.
-- 2. `place_names` aggregated over every map, published or not. The view is
--    `security_invoker`, which gates it correctly for a client using the anon
--    key — but every server route reads it on the service client, which
--    bypasses RLS, so an anonymous reader of /place/<name> received counts,
--    year spans and draft map UUIDs drawn from unpublished sheets. Published
--    only now: no consumer needs draft names, and the gate should not depend on
--    which key happens to read the view.
-- 3. `search_labels` made every caller re-derive lng/lat by fetching the map's
--    annotation over HTTP — up to twenty fetches per keystroke-group, from an
--    anonymous endpoint — for coordinates migration 066 already stores. It
--    returns them now.
-- 4. The `warp` job updated one row per round trip. A real map holds ~1,400
--    extractions, which is past Cloudflare's subrequest cap for a single
--    request, so the job could not complete for any map worth warping. These
--    two setters take a batch.

-- ── 1. ordering ──────────────────────────────────────────────────────────
create or replace function public.context_at(
  p_lng         double precision,
  p_lat         double precision,
  p_radius_m    double precision default 150,
  p_year_from   integer default null,
  p_year_to     integer default null,
  p_public_only boolean default true,
  p_limit       integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with params as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as here,
           greatest(1, least(p_radius_m, 5000))                    as radius,
           greatest(1, least(p_limit, 200))                        as lim
  ),
  visible as (
    select m.id, m.name, m.year, m.status, m.allmaps_id
      from public.maps m
     where (not p_public_only or m.status in ('public', 'featured'))
       and (p_year_from is null or m.year >= p_year_from)
       and (p_year_to   is null or m.year <= p_year_to)
  ),
  label as (
    -- Numeric cast, not the text sort this had before.
    select jsonb_agg(x order by (x->>'distance_m')::numeric) as v from (
      select jsonb_build_object(
               'id', e.id, 'map_id', e.map_id, 'map_name', v.name, 'year', v.year,
               'text', coalesce(e.text_validated, e.text),
               'category', coalesce(e.category_validated, e.category),
               'status', e.status,
               'distance_m', round(st_distance(e.geom, p.here)::numeric, 1),
               'geom_rmse', e.geom_rmse,
               'lng', st_x(e.geom::geometry), 'lat', st_y(e.geom::geometry)
             ) as x
        from public.ocr_extractions e
        join visible v on v.id = e.map_id
        cross join params p
       where e.geom is not null
         and e.status <> 'rejected'
         and st_dwithin(e.geom, p.here, p.radius)
       order by st_distance(e.geom, p.here)
       limit (select lim from params)
    ) s
  ),
  footprint as (
    select jsonb_agg(x order by (x->>'distance_m')::numeric) as v from (
      select jsonb_build_object(
               'id', f.id, 'map_id', f.map_id, 'map_name', v.name, 'year', v.year,
               'name', f.name, 'feature_type', f.feature_type,
               'category', f.category, 'source', f.source, 'status', f.status,
               'distance_m', round(st_distance(f.geom, p.here)::numeric, 1),
               'geom_rmse', f.geom_rmse,
               'geometry', st_asgeojson(f.geom::geometry)::jsonb
             ) as x
        from public.footprint_submissions f
        join visible v on v.id = f.map_id
        cross join params p
       where f.geom is not null
         and f.status = 'approved'
         and st_dwithin(f.geom, p.here, p.radius)
       order by st_distance(f.geom, p.here)
       limit (select lim from params)
    ) s
  ),
  covering as (
    select jsonb_agg(x order by (x->>'year')::integer nulls last) as v from (
      select jsonb_build_object(
               'id', v.id, 'name', v.name, 'year', v.year,
               'status', v.status, 'allmaps_id', v.allmaps_id
             ) as x
        from visible v
        join public.maps m on m.id = v.id
       where m.bbox is not null
         and array_length(m.bbox, 1) = 4
         and p_lng between m.bbox[1] and m.bbox[3]
         and p_lat between m.bbox[2] and m.bbox[4]
       order by v.year
       limit (select lim from params)
    ) s
  ),
  story as (
    select jsonb_agg(x order by (x->>'distance_m')::numeric) as v from (
      select jsonb_build_object(
               'story_id', sp.story_id, 'point_id', sp.id, 'title', sp.title,
               'story_title', s2.title,
               'distance_m', round(
                 st_distance(
                   st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
                   p.here
                 )::numeric, 1)
             ) as x
        from public.story_points sp
        join public.stories s2 on s2.id = sp.story_id
        cross join params p
       where sp.lon is not null and sp.lat is not null
         and (not p_public_only or s2.status = 'approved')
         and st_dwithin(
               st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
               p.here, p.radius)
       -- Order by the distance itself, so the limit keeps the nearest points.
       order by st_distance(
                  st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography, p.here)
       limit (select lim from params)
    ) s
  )
  select jsonb_build_object(
    'at',         jsonb_build_array(p_lng, p_lat),
    'radius_m',   (select radius from params),
    'maps',       coalesce((select v from covering), '[]'::jsonb),
    'labels',     coalesce((select v from label), '[]'::jsonb),
    'footprints', coalesce((select v from footprint), '[]'::jsonb),
    'stories',    coalesce((select v from story), '[]'::jsonb)
  );
$$;

-- ── 2. the gazetteer covers published sheets only ────────────────────────
create or replace view public.place_names
with (security_invoker = true)
as
  select
    public.place_key(e.text, e.text_validated)                           as name_key,
    mode() within group (order by coalesce(e.text_validated, e.text))    as name,
    array_agg(distinct coalesce(e.text_validated, e.text))               as variants,
    array_remove(array_agg(distinct m.year), null)                       as years,
    min(m.year)                                                          as first_year,
    max(m.year)                                                          as last_year,
    array_agg(distinct e.map_id)                                         as map_ids,
    count(*)                                                             as mentions,
    mode() within group (order by coalesce(e.category_validated, e.category)) as category,
    extensions.st_y(
      extensions.st_centroid(
        extensions.st_collect(e.geom::extensions.geometry))::extensions.geometry) as lat,
    extensions.st_x(
      extensions.st_centroid(
        extensions.st_collect(e.geom::extensions.geometry))::extensions.geometry) as lng,
    max(e.geom_rmse)                                                     as geom_rmse
    from public.ocr_extractions e
    join public.maps m on m.id = e.map_id
   where e.status <> 'rejected'
     -- Published only. security_invoker gates a client using the anon key, but
     -- every server route reads this on the service client, which bypasses RLS.
     -- A gate that depends on which key reads it is not a gate.
     and m.status in ('public', 'featured')
     and coalesce(e.category_validated, e.category)
         in ('street', 'hydrology', 'place', 'building', 'institution')
     and length(public.place_key(e.text, e.text_validated)) >= 2
   group by public.place_key(e.text, e.text_validated);

comment on view public.place_names is
  'Gazetteer of attested place names from published maps, grouped from ocr_extractions.';

-- ── 3. search_labels returns the stored position ─────────────────────────
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
  sim         real,
  -- From `geom` (migration 066). Null until the map has been warped, which is
  -- what the caller falls back on; it exists so the common path costs no HTTP.
  lng         double precision,
  lat         double precision,
  geom_rmse   double precision
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
           word_similarity(q.key, public.label_key(e.text, e.text_validated)) as sim,
           e.geom, e.geom_rmse
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
         global_x, global_y, global_w, global_h, sim,
         st_x(geom::geometry), st_y(geom::geometry), geom_rmse
    from hits
   order by sim desc, confidence desc
   limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.search_labels(text, boolean, integer) from public, anon, authenticated;
grant execute on function public.search_labels(text, boolean, integer) to service_role;

-- ── 4. batched geometry writes for the warp job ──────────────────────────
-- One statement per batch instead of one round trip per row. The `warp` job is
-- the only caller; it needs to move thousands of rows for a single map, and a
-- Pages Function gets a few dozen subrequests, not a few thousand.
--
-- `p_rows` is [{ id, geom, geom_src, geom_rmse }] where `geom` is EWKT
-- ('SRID=4326;POINT(…)'), or null for a row that could not be warped.
create or replace function public.set_extraction_geom(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'set_extraction_geom: p_rows must be a jsonb array';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'set_extraction_geom: at most 1000 rows per call (got %)',
      jsonb_array_length(p_rows);
  end if;

  update public.ocr_extractions e
     set geom      = case when r.geom is null then null else st_geogfromtext(r.geom) end,
         geom_src  = r.geom_src,
         geom_rmse = r.geom_rmse
    from jsonb_to_recordset(p_rows)
           as r(id uuid, geom text, geom_src text, geom_rmse double precision)
   where e.id = r.id;

  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.set_footprint_geom(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'set_footprint_geom: p_rows must be a jsonb array';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'set_footprint_geom: at most 1000 rows per call (got %)',
      jsonb_array_length(p_rows);
  end if;

  update public.footprint_submissions f
     set geom      = case when r.geom is null then null else st_geogfromtext(r.geom) end,
         geom_src  = r.geom_src,
         geom_rmse = r.geom_rmse
    from jsonb_to_recordset(p_rows)
           as r(id uuid, geom text, geom_src text, geom_rmse double precision)
   where f.id = r.id;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.set_extraction_geom(jsonb) from public, anon, authenticated;
revoke all on function public.set_footprint_geom(jsonb) from public, anon, authenticated;
grant execute on function public.set_extraction_geom(jsonb) to service_role;
grant execute on function public.set_footprint_geom(jsonb) to service_role;
