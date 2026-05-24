#!/usr/bin/env node
// Bulk-mirror maps to R2: tile first, then rewrite DB. Replicates the
// /api/admin/maps/[id]/mirror-r2 endpoint logic using SUPABASE_SERVICE_KEY.
//
// Usage:
//   node scripts/bulk_mirror_r2.mjs              # dry-run, list candidates
//   node scripts/bulk_mirror_r2.mjs --apply      # mirror all candidates
//   node scripts/bulk_mirror_r2.mjs --apply --limit 2   # smoke-test first N
//   node scripts/bulk_mirror_r2.mjs --apply --map-id <uuid>   # single map

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import { appendFileSync, readFileSync } from 'fs';
import { resolve } from 'path';

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
    .filter(([k]) => k)
);
const SUPABASE_URL = env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;
const mapIdIdx = args.indexOf('--map-id');
const onlyMapId = mapIdIdx >= 0 ? args[mapIdIdx + 1] : null;

const R2_HOST = 'iiif.maparchive.vn';
const R2_BASE = `https://${R2_HOST}/iiif`;
const ANNOTATIONS_BUCKET = 'annotations';

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const LOG = resolve(process.cwd(), `scripts/mirror_r2_${ts}.log`);
const log = (s) => { console.log(s); appendFileSync(LOG, s + '\n'); };

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

function extractSourceUrl(annotation) {
  const items = annotation.type === 'Annotation' ? [annotation] : (annotation.items ?? annotation.maps ?? []);
  for (const item of items) {
    const target = item.target;
    if (!target) continue;
    const source = typeof target === 'string' ? target : (target.source ?? target);
    const id = typeof source === 'string' ? source : source?.id;
    if (id && typeof id === 'string' && id.startsWith('http')) return id;
  }
  return null;
}

function rewriteSourceUrl(annotation, oldUrl, newUrl) {
  const raw = JSON.stringify(annotation);
  const oldBase = oldUrl.replace(/\/+$/, '');
  const newBase = newUrl.replace(/\/+$/, '');
  return JSON.parse(raw.replaceAll(oldBase + '/', newBase + '/').replaceAll(oldBase, newBase));
}

function downloadUrlFor(originalIiifImage) {
  if (!originalIiifImage) return null;
  const base = originalIiifImage.replace(/\/$/, '');
  return originalIiifImage.includes('gallica.bnf.fr')
    ? `${base}/full/full/0/native.jpg`
    : `${base}/full/max/0/default.jpg`;
}

function runTileMap(mapId, downloadUrl, originalIiif) {
  return new Promise((resolve, reject) => {
    const p = spawn('./scripts/tile_map.sh', [mapId, downloadUrl, originalIiif], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    p.stdout.on('data', (d) => { const s = d.toString(); out += s; process.stdout.write(s); });
    p.stderr.on('data', (d) => { const s = d.toString(); out += s; process.stderr.write(s); });
    p.on('close', (code) => {
      appendFileSync(LOG, out);
      if (code === 0) resolve(); else reject(new Error(`tile_map.sh exited ${code}`));
    });
  });
}

async function mirrorDb(map) {
  const annotationUrl = map.annotation_url ?? `https://annotations.allmaps.org/images/${map.allmaps_id}`;
  const r = await fetch(annotationUrl + '?_t=' + Date.now(), { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Annotation fetch ${r.status}`);
  const annotation = await r.json();

  const oldSourceUrl = extractSourceUrl(annotation);
  const newIiifBase = `${R2_BASE}/${map.id}`;
  const updated = oldSourceUrl ? rewriteSourceUrl(annotation, oldSourceUrl, newIiifBase) : annotation;

  // Upload annotation JSON
  const storagePath = `${map.id}.json`;
  const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${ANNOTATIONS_BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(updated, null, 2),
  });
  if (!upRes.ok) throw new Error(`Storage upload ${upRes.status}: ${await upRes.text()}`);

  const publicAnnotationUrl = `${SUPABASE_URL}/storage/v1/object/public/${ANNOTATIONS_BUCKET}/${storagePath}`;

  // Update maps row
  const { error: mErr } = await sb.from('maps').update({
    iiif_image: newIiifBase,
    annotation_url: publicAnnotationUrl,
    thumbnail: `${newIiifBase}/full/256,/0/default.jpg`,
    collection: 'Vietnam Map Archive',
  }).eq('id', map.id);
  if (mErr) throw new Error(`maps update: ${mErr.message}`);

  // Upsert source row, demote others
  const { data: existing } = await sb.from('map_iiif_sources').select('id, iiif_image, sort_order').eq('map_id', map.id);
  await sb.from('map_iiif_sources').update({ is_primary: false }).eq('map_id', map.id).eq('is_primary', true);

  const r2Existing = (existing ?? []).find(s => (s.iiif_image ?? '').includes('maparchive.vn'));
  if (r2Existing) {
    const { error } = await sb.from('map_iiif_sources').update({ iiif_image: newIiifBase, is_primary: true }).eq('id', r2Existing.id);
    if (error) throw new Error(`source update: ${error.message}`);
  } else {
    const maxOrder = (existing ?? []).reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0);
    const { error } = await sb.from('map_iiif_sources').insert({
      map_id: map.id,
      label: 'Cloudflare R2',
      source_type: 'r2',
      iiif_image: newIiifBase,
      is_primary: true,
      sort_order: maxOrder + 1,
    });
    if (error) throw new Error(`source insert: ${error.message}`);
  }

  return { newIiifBase, publicAnnotationUrl };
}

async function main() {
  log(`\n=== bulk mirror to R2 — ${new Date().toISOString()} ===`);
  log(apply ? 'APPLY mode' : 'DRY-RUN (pass --apply to execute)');

  let q = sb.from('maps').select('id, name, iiif_image, allmaps_id, annotation_url').not('iiif_image', 'is', null);
  if (onlyMapId) q = q.eq('id', onlyMapId);
  const { data: all, error } = await q;
  if (error) throw error;

  let candidates = all.filter(m => m.iiif_image && !m.iiif_image.includes(R2_HOST));
  if (limit) candidates = candidates.slice(0, limit);

  log(`Candidates: ${candidates.length}`);
  for (const m of candidates) log(`  [${m.id}] ${m.name} — ${m.iiif_image}`);

  if (!apply) { log('\nDry-run complete. Pass --apply to execute.'); return; }

  let ok = 0, fail = 0;
  for (const m of candidates) {
    log(`\n── ${m.name} (${m.id}) ──`);
    const original = m.iiif_image;
    const dl = downloadUrlFor(original);
    if (!dl) { log(`  ✗ no download URL`); fail++; continue; }
    try {
      log(`  → tiling from ${dl}`);
      await runTileMap(m.id, dl, original);
      log(`  → rewriting DB`);
      const res = await mirrorDb(m);
      log(`  ✓ ${res.newIiifBase}`);
      ok++;
    } catch (e) {
      log(`  ✗ ${e.message}`);
      fail++;
    }
  }
  log(`\n=== done: ${ok} ok, ${fail} failed. Log: ${LOG} ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
