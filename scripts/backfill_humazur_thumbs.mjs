#!/usr/bin/env node
// Backfill thumbnails for Humazur scout_candidates rows.
// For each Humazur item without a thumbnail:
//   1. Fetch the item: /api/items/{id}
//   2. Read first o:media @id → /api/media/{media_id}
//   3. Get o:thumbnail_urls.medium
//   4. PATCH scout_candidates.thumbnail
//
// Usage:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/backfill_humazur_thumbs.mjs
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/backfill_humazur_thumbs.mjs --limit 100
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/backfill_humazur_thumbs.mjs --status pending --min-score 40

import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim())).filter(([k]) => k)
);
const SUPABASE_URL = env.PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY;
const UA = 'Mozilla/5.0 VMA-Thumb-Backfill/1.0';

const lidx = process.argv.indexOf('--limit');
const LIMIT = lidx > -1 ? parseInt(process.argv[lidx + 1]) : 5000;
const midx = process.argv.indexOf('--min-score');
const MIN_SCORE = midx > -1 ? parseInt(process.argv[midx + 1]) : 0;
const sidx = process.argv.indexOf('--status');
const STATUS = sidx > -1 ? process.argv[sidx + 1] : 'pending';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function sb(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
}

async function fetchJson(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function deriveThumb(itemId) {
  const item = await fetchJson(`https://humazur.univ-cotedazur.fr/api/items/${itemId}`);
  if (!item) return null;
  const media = item['o:media'];
  if (!Array.isArray(media) || !media[0]?.['@id']) return null;
  const mediaIdMatch = String(media[0]['@id']).match(/\/media\/(\d+)/);
  if (!mediaIdMatch) return null;
  const mediaObj = await fetchJson(`https://humazur.univ-cotedazur.fr/api/media/${mediaIdMatch[1]}`);
  if (!mediaObj) return null;
  return mediaObj['o:thumbnail_urls']?.['medium']
      || mediaObj['o:thumbnail_urls']?.['large']
      || mediaObj['o:thumbnail_urls']?.['square']
      || null;
}

// ---- main ----
let url = `/scout_candidates?source=eq.humazur&thumbnail=is.null&status=eq.${STATUS}&score=gte.${MIN_SCORE}&order=score.desc&limit=${LIMIT}&select=id,external_id,title`;
const r = await sb(url);
const rows = await r.json();
console.log(`Found ${rows.length} Humazur rows without thumbnails (status=${STATUS}, min_score=${MIN_SCORE})`);

let ok = 0, miss = 0;
for (let i = 0; i < rows.length; i++) {
  const c = rows[i];
  const thumb = await deriveThumb(c.external_id);
  if (thumb) {
    await sb(`/scout_candidates?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ thumbnail: thumb }) });
    ok++;
  } else {
    miss++;
  }
  if ((i + 1) % 10 === 0) process.stdout.write(`  ${i+1}/${rows.length}  (ok=${ok} miss=${miss})\r`);
  await sleep(150);
}
console.log(`\nDone: ${ok} thumbnails backfilled, ${miss} not found.`);
