#!/usr/bin/env node
// Backfill `maps.bbox` from each map's Allmaps annotation.
//
//   node --env-file=.env scripts/backfill_map_bbox.mjs [--dry] [--force] [--concurrency N]
//
// Measured on 2026-09-04: 0 of 101 maps had a bbox, so every "where is this
// map?" question — /explore's zoom-to-overlay, `?map=` deep links, and any
// selection by area — fell through `resolveBounds()` to a live annotation
// fetch per map. The column exists and the ladder already prefers it; nothing
// had ever written it.
//
// The value is the GCP hull, byte-for-byte what `fetchAnnotationBounds()`
// computes in the browser, so filling it changes no behaviour — it only stops
// the network round-trip. That also means it is the *control point* extent,
// not the sheet's paper edge: GCPs rarely reach the corners, so a bbox is a
// slight under-estimate of what the warped image covers.
//
// Skips maps that already have one unless --force. 404 (never georeferenced)
// and no-GCP annotations are left null, not zeroed.

import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const force = args.includes('--force');
const cIdx = args.indexOf('--concurrency');
const concurrency = cIdx > -1 ? Number(args[cIdx + 1]) : 10;

const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

/** Bare hex id → the Allmaps annotation endpoint; a full URL passes through.
 *  Mirrors `annotationUrlForSource()` in $lib/core/iiif/annotationUrl.ts. */
function annotationUrl(source) {
  const trimmed = source.trim();
  try {
    const u = new URL(trimmed);
    if (u.protocol === 'http:' || u.protocol === 'https:') return trimmed;
  } catch {
    // not a URL — treat as an Allmaps image id
  }
  return `https://annotations.allmaps.org/images/${trimmed}`;
}

/** Every world coordinate in an annotation, however it stores its GCPs.
 *  Mirrors `extractGCPs()` in $lib/core/geo/mapBounds.ts. */
function worldPoints(annotation) {
  let ann = annotation;
  if (Array.isArray(ann?.items) && ann.items.length) ann = ann.items[0];
  const bodies = Array.isArray(ann?.body) ? ann.body : [ann?.body];
  const points = [];
  for (const body of bodies) {
    if (Array.isArray(body?.features)) {
      for (const f of body.features) {
        const c = f?.geometry?.coordinates;
        if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
          points.push([c[0], c[1]]);
        }
      }
    }
    if (Array.isArray(body?.transformation?.gcps)) {
      for (const g of body.transformation.gcps) {
        if (Array.isArray(g?.world) && g.world.length >= 2) points.push([g.world[0], g.world[1]]);
      }
    }
  }
  return points;
}

const { data: maps, error } = await db
  .from('maps')
  .select('id, name, year, bbox, allmaps_id, annotation_url')
  .order('year', { nullsFirst: false });
if (error) throw error;

const todo = maps.filter(
  (m) =>
    (m.annotation_url || m.allmaps_id) && (force || !Array.isArray(m.bbox) || m.bbox.length !== 4)
);
console.log(
  `${maps.length} maps · ${maps.filter((m) => m.bbox?.length === 4).length} already have a bbox → ${todo.length} to fetch${dry ? ' (dry run)' : ''}`
);

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < todo.length) {
    const m = todo[cursor++];
    const source = m.annotation_url ?? m.allmaps_id;
    try {
      const res = await fetch(annotationUrl(source));
      if (!res.ok) {
        results.push({ m, bbox: null, why: `HTTP ${res.status}` });
        continue;
      }
      const points = worldPoints(await res.json());
      if (!points.length) {
        results.push({ m, bbox: null, why: 'no GCPs' });
        continue;
      }
      const lon = points.map((p) => p[0]);
      const lat = points.map((p) => p[1]);
      results.push({
        m,
        bbox: [Math.min(...lon), Math.min(...lat), Math.max(...lon), Math.max(...lat)],
        n: points.length,
      });
    } catch (e) {
      results.push({ m, bbox: null, why: String(e?.message ?? e) });
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));

// A hull of one point is a degenerate box; the app's `looksValidBbox` would
// reject it downstream, so don't write it in the first place.
const writable = results.filter((r) => r.bbox && r.bbox[0] < r.bbox[2] && r.bbox[1] < r.bbox[3]);
const skipped = results.filter((r) => !writable.includes(r));

for (const r of writable) {
  const b = r.bbox.map((n) => +n.toFixed(6));
  console.log(`  ${String(r.m.year ?? '????')}  ${r.n}gcp  [${b}]  ${r.m.name.slice(0, 48)}`);
  if (dry) continue;
  const { error: upErr } = await db.from('maps').update({ bbox: b }).eq('id', r.m.id);
  if (upErr) throw upErr;
}

console.log(`\n${writable.length} with a real extent, ${skipped.length} left null`);
const why = {};
for (const r of skipped) why[r.why] = (why[r.why] ?? 0) + 1;
for (const [k, n] of Object.entries(why)) console.log(`  ${String(n).padStart(3)}  ${k}`);
if (!dry) console.log(`\nwrote ${writable.length} bboxes`);
