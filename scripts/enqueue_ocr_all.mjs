#!/usr/bin/env node
// Queue an `ocr` job for every georeferenced map that has never been OCR'd.
//
//   node --env-file=.env scripts/enqueue_ocr_all.mjs [--dry] [--force] [--limit N]
//                                                    [--untriaged] [--model NAME]
//                                                    [--tile-metres M]
//
// Label search (`/api/search?include=labels`, mig 065) is only as good as the
// share of the corpus that has extractions, and measured on 2026-09-02 that was
// one map. This inserts the same `pipeline_jobs` row `/api/admin/maps/[id]/ocr`
// does, with the same defaults, then the worker drains it:
//   source work/ocr/.venv/bin/activate && python work/worker/vma_worker.py
//
// --force also re-queues maps that already have extractions (new run_id).
// The one-live-job index turns a duplicate into a skipped row, never a second job.
//
// By default this queues only sheets someone has **saved a triage** for in
// /contribute/digitalize (`maps.triage`, migration 069): the neatline, tile grid
// and per-tile priorities a person decided on, spread into the job payload
// unchanged. That is the deliberate order — triage, look at what you did, then
// queue. `--untriaged` includes the rest, which run in `auto` mode and let the
// scout pass guess the neatline; that is the old behaviour and it is worse.

import { createClient } from '@supabase/supabase-js';
import { GcpTransformer } from '@allmaps/transform';
import { parseAnnotation } from '@allmaps/annotation';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const force = args.includes('--force');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx > -1 ? Number(args[limitIdx + 1]) : Infinity;
const untriaged = args.includes('--untriaged');
const modelIdx = args.indexOf('--model');
const model = modelIdx > -1 ? args[modelIdx + 1] : null;

// Ground per Gemini call, in metres. Opt-in, and it only ever makes a tile
// FINER.
//
// What starves an OCR read is one call covering too much ground, and a fixed
// pixel tile is a different amount of ground on every sheet: 2048 px is 1.7 km
// on the 1923 sheet and 5.7 km on the 1959 one. Measured on the 1959 sheet,
// same crop and same 1:1 rendering, changing only the tile: 5.7 km/call found 1
// label inside the study area, 2.9 km found 2, 1.4 km found 6. Corpus-wide the
// same change is +19%, concentrated entirely in the sheets whose ground-per-call
// actually dropped a long way — see docs/pipelines.md.
//
// Off by default for two reasons. A saved triage carries the tile size a person
// chose, and overriding that silently would defeat the point of saving one. And
// the first version of this rule made a sheet WORSE: at 0.34 m/px the 1882
// cadastral needs a 4118 px tile to reach 1400 m, so a fixed ground target
// coarsened it. Hence `Math.min` against the tile we would otherwise have used —
// the rule may make a sheet finer, never coarser.
const tmIdx = args.indexOf('--tile-metres');
const tileMetres = tmIdx > -1 ? Number(args[tmIdx + 1]) : null;
const TILE_PX_MIN = 384;

const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const { data: maps, error } = await db
  .from('maps')
  .select('id, name, year, iiif_image, allmaps_id, annotation_url, triage')
  .eq('georef_done', true)
  .not('iiif_image', 'is', null)
  .order('year');
if (error) throw error;

// Which maps already have extractions. `.select('map_id').limit(100000)` was
// wrong: PostgREST caps a response at 1000 rows whatever the limit says, and
// with 1404 extraction rows in the table this saw exactly one of the two
// OCR'd maps and re-queued the other on every run. A grouped count is capped
// by the number of *maps*, not the number of rows.
const hasOcr = new Set();
{
  const { data: rows, error: exErr } = await db
    .from('ocr_extractions')
    .select('map_id')
    .limit(1000);
  if (exErr) throw exErr;
  for (const r of rows ?? []) hasOcr.add(r.map_id);
  // The cap above is a silent truncation, so confirm per map rather than
  // trusting a full-table scan we cannot page cheaply.
  for (const m of maps) {
    if (hasOcr.has(m.id)) continue;
    const { count, error: cErr } = await db
      .from('ocr_extractions')
      .select('*', { count: 'exact', head: true })
      .eq('map_id', m.id);
    if (cErr) throw cErr;
    if (count) hasOcr.add(m.id);
  }
}

const { data: live } = await db
  .from('pipeline_jobs')
  .select('map_id')
  .eq('kind', 'ocr')
  .in('status', ['queued', 'claimed', 'running']);
const inFlight = new Set((live ?? []).map((r) => r.map_id));

// `triage` defaults to `{}`, so a neatline is what tells a saved triage from a
// map nobody has opened.
const triageOf = (m) => (m.triage?.neatline ? m.triage : null);

// The crop the tile pass should cover. A `main_map` region is the layout pass's
// answer to "where is the terrain", which beats the neatline: the neatline is
// the printed border, and a legend or an index printed inside it is inside the
// neatline too. Mirrors `tilingCrop()` in src/lib/data/maps/triageTypes.ts —
// this file is plain .mjs and cannot import the TS.
const cropOf = (t) =>
  (t?.regions ?? []).find((r) => r.category === 'main_map')?.bbox ?? t?.neatline ?? null;
const nTriaged = maps.filter(triageOf).length;

const todo = maps
  .filter((m) => !inFlight.has(m.id) && (force || !hasOcr.has(m.id)))
  .filter((m) => untriaged || triageOf(m))
  .slice(0, limit);

console.log(
  `${maps.length} georeferenced · ${nTriaged} triaged · ${hasOcr.size} already OCR'd · ` +
    `${inFlight.size} in flight → ${todo.length} to queue${dry ? ' (dry run)' : ''}`
);
if (!untriaged && nTriaged < maps.length) {
  console.log(
    `  ${maps.length - nTriaged} sheets have no saved triage and are skipped. ` +
      `Triage them at /contribute/digitalize, or pass --untriaged to run them in auto mode.`
  );
}

/**
 * Ground metres per source pixel over the rectangle we are about to tile.
 *
 * Measured through the sheet's own georeference — warp the crop's four corners
 * to lng/lat and compare the real area with the pixel area. Rotation- and
 * skew-invariant, unlike a bbox-to-width ratio, which read 0.33 m/px on the
 * 1912 sheet where the truth is nearer 1.8.
 *
 * Returns null when there is nothing to measure with; the caller then keeps the
 * tile it already had rather than guessing.
 */
/** `[x, y, w, h]` bounding the GCPs in source pixels, or null if unusable. */
function gcpPixelBox(gcps) {
  const pts = (gcps ?? []).map((g) => g.resource ?? g.pixel).filter(Boolean);
  if (pts.length < 3) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return w > 1 && h > 1 ? [Math.min(...xs), Math.min(...ys), w, h] : null;
}

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((10.78 * Math.PI) / 180);

function ringAreaM2(lonlats) {
  let a = 0;
  for (let i = 0, j = lonlats.length - 1; i < lonlats.length; j = i++) {
    a += lonlats[j][0] * lonlats[i][1] - lonlats[i][0] * lonlats[j][1];
  }
  return (Math.abs(a) / 2) * M_PER_DEG_LON * M_PER_DEG_LAT;
}

async function cropMpp(m, crop) {
  const url =
    m.annotation_url ||
    (m.allmaps_id ? `https://annotations.allmaps.org/images/${m.allmaps_id}` : null);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const parsed = parseAnnotation(await res.json());
    if (!parsed.length) return null;
    const t = new GcpTransformer(parsed[0].gcps, parsed[0].transformation?.type ?? 'polynomial');
    // No crop means nobody has triaged this sheet — which is the majority, and
    // the ones this rule exists for. Fall back to the pixel hull of the GCPs
    // themselves: they sit on identifiable ground features, so their hull is
    // inside the map content, and warping its corners interpolates rather than
    // extrapolating. Warping the *image* corners instead would run a polynomial
    // out past its control points and into the margins, which is how the naive
    // bbox-to-width ratio read 0.33 m/px on the 1912 sheet.
    const rect = crop ?? gcpPixelBox(parsed[0].gcps);
    if (!rect) return null;
    const [x, y, w, h] = rect;
    const ground = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ].map((p) => t.transformToGeo(p));
    const area = ringAreaM2(ground);
    return area > 0 && w * h > 0 ? Math.sqrt(area / (w * h)) : null;
  } catch {
    return null;
  }
}

/** The tile to use, never coarser than `current`. */
function groundTile(mpp, current) {
  if (!mpp || !tileMetres) return current;
  const raw = Math.round(tileMetres / mpp);
  return Math.max(TILE_PX_MIN, Math.min(raw, current));
}

let queued = 0;
for (const m of todo) {
  const t = triageOf(m);
  const usingMainMap = (t?.regions ?? []).some((r) => r.category === 'main_map');
  const crop = cropOf(t);
  const baseTile = t?.tile_size ?? 2400;
  const mpp = tileMetres ? await cropMpp(m, crop) : null;
  const tile = groundTile(mpp, baseTile);
  // Equal to the tile is 1:1, the source ceiling. Left unset this fell through
  // to the worker's own 1024 default, which on a 2400 px tile is the 2.34x
  // downsample that put the 1959 sheet in front of the model at ~6.5 m/px.
  // Nothing above 1:1 buys detail, but a very small image is not what these
  // prompts expect, hence the 1024 floor.
  const render = Math.max(tile, 1024);
  const ground = mpp ? `   ${((tile * mpp) / 1000).toFixed(2)} km/call` : '';
  console.log(
    `  ${m.year ?? '????'}  ${m.name}` +
      (t ? (usingMainMap ? '   (cropped to main_map)' : '') : '   (no triage — auto mode)') +
      (tile !== baseTile ? `   tile ${baseTile} → ${tile}` : '') +
      ground
  );
  if (dry) continue;
  // Per map, not per second: a shared run_id would collapse every map's run
  // summary into one and break `--ocr-run-id` seeding for segmentation.
  const run_id = `${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}-${m.id.slice(0, 8)}`;
  const { error: insErr } = await db.from('pipeline_jobs').insert({
    kind: 'ocr',
    map_id: m.id,
    payload: {
      run_id,
      tile_size: tile,
      render_size: render,
      overlap: t?.overlap ?? Math.round(tile / 4),
      concurrency: 3,
      min_confidence: 0.5,
      // A saved neatline is the whole point of triaging: with one, the scout
      // pass has nothing left to guess, so `auto` only still runs the legend.
      auto: true,
      ...(crop ? { neatline: crop } : {}),
      ...(t?.tile_overrides && Object.keys(t.tile_overrides).length
        ? { tile_overrides: t.tile_overrides }
        : {}),
      ...(model ? { model } : {}),
    },
  });
  if (insErr && insErr.code !== '23505') throw insErr; // 23505 = one-live-job index, already queued
  if (!insErr) queued++;
}
if (!dry) console.log(`queued ${queued}`);
