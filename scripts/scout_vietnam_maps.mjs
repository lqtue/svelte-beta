#!/usr/bin/env node
// Scout: discover Vietnam/Indochina maps across BnF Gallica + federated partners
// (Humazur, Bordeaux, etc.) via the Gallica SRU API. READ-ONLY.
//
// Strategy:
//   1. Query SRU for each place keyword filtered to dc.type=carte
//   2. Paginate (50 records per page)
//   3. Dedupe by ARK identifier (or first identifier)
//   4. Classify by `provenance` field (BnF vs federated partner)
//   5. Cross-check against existing VMA maps (iiif_image / iiif_manifest / source_url)
//   6. Emit scout_results_<ts>.json + summary
//
// Usage:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/scout_vietnam_maps.mjs
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/scout_vietnam_maps.mjs --keywords Saigon,Hanoi --max 50

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim())).filter(([k]) => k)
);
const SUPABASE_URL = env.PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY;
const UA = 'Mozilla/5.0 VMA-Scout/1.0';

const kwIdx = process.argv.indexOf('--keywords');
const KEYWORDS = kwIdx > -1
  ? process.argv[kwIdx + 1].split(',')
  : ['Saigon', 'Cochinchine', 'Indochine', 'Tonkin', 'Annam', 'Hanoi', 'Hué', 'Hue',
     'Gia Định', 'Cholon', 'Vietnam', 'Viêt-nam', 'Đà Nẵng', 'Tourane', 'Haiphong'];
const maxIdx = process.argv.indexOf('--max');
const MAX_PER_KW = maxIdx > -1 ? parseInt(process.argv[maxIdx + 1]) : 250;

// ---- Existing VMA maps for dedup ----
async function fetchExistingArks() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/maps?select=id,name,iiif_manifest,iiif_image,source_url`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  const rows = await r.json();
  const arks = new Set();
  for (const m of rows) {
    for (const v of [m.iiif_manifest, m.iiif_image, m.source_url]) {
      if (!v) continue;
      const a = v.match(/ark:\/[0-9]+\/[a-z0-9]+/i);
      if (a) arks.add(a[0]);
    }
  }
  console.log(`VMA has ${rows.length} maps with ${arks.size} known ARKs`);
  return arks;
}

// ---- Parse minimal XML SRU response without dependencies ----
function parseSRU(xml) {
  const records = [];
  // Split on srw:record
  const blocks = xml.split('<srw:record>').slice(1);
  for (const b of blocks) {
    const end = b.indexOf('</srw:record>');
    if (end === -1) continue;
    const chunk = b.slice(0, end);
    const rec = {};
    const fields = ['dc:title', 'dc:creator', 'dc:date', 'dc:type', 'dc:format',
                    'dc:language', 'dc:publisher', 'dc:rights', 'dc:source',
                    'dc:identifier', 'dc:coverage', 'dc:subject'];
    for (const f of fields) {
      const key = f.replace('dc:', '');
      rec[key] = [];
      const re = new RegExp(`<${f}>([^<]+)</${f}>`, 'g');
      let m; while ((m = re.exec(chunk))) rec[key].push(m[1]);
    }
    // Extract provenance from extraRecordData
    const prov = chunk.match(/<provenance>([^<]+)<\/provenance>/);
    rec.provenance = prov ? prov[1] : null;
    // Find ARK (BnF/Gallica) or alternate identifier
    let ark = null;
    for (const id of rec.identifier) {
      const m = id.match(/ark:\/[0-9]+\/[a-z0-9]+/i);
      if (m) { ark = m[0]; break; }
    }
    rec.ark = ark;
    rec.url = rec.identifier.find(i => i.startsWith('http')) || null;
    records.push(rec);
  }
  return records;
}

async function sruSearch(keyword, maxRecords = 250) {
  const all = [];
  let start = 1;
  const page = 50;
  while (start <= maxRecords) {
    const q = encodeURIComponent(`(dc.type adj "carte") and (dc.title all "${keyword}")`);
    const url = `https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2&query=${q}&maximumRecords=${page}&startRecord=${start}`;
    let attempts = 0;
    while (attempts < 3) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!r.ok) { if (r.status === 429) { await sleep(5000); attempts++; continue; } throw new Error(`${r.status}`); }
        const xml = await r.text();
        const total = parseInt((xml.match(/<srw:numberOfRecords>(\d+)/) || [])[1] || '0');
        const recs = parseSRU(xml);
        all.push(...recs);
        if (start === 1) process.stdout.write(`(${total} total) `);
        if (start + page > total || recs.length === 0) return { all, total };
        start += page;
        await sleep(300);
        break;
      } catch (e) {
        attempts++;
        if (attempts === 3) { console.log(` ERR ${e.message}`); return { all, total: 0 }; }
        await sleep(2000);
      }
    }
  }
  return { all, total: all.length };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- main ----
const existingArks = await fetchExistingArks();
const allRecords = new Map(); // dedup by ark or url

for (const kw of KEYWORDS) {
  process.stdout.write(`  ${kw.padEnd(15)} `);
  const { all, total } = await sruSearch(kw, MAX_PER_KW);
  let newOnes = 0;
  for (const r of all) {
    const key = r.ark || r.url || (r.title[0] + r.date[0]);
    if (!allRecords.has(key)) { allRecords.set(key, { ...r, foundVia: [kw] }); newOnes++; }
    else allRecords.get(key).foundVia.push(kw);
  }
  console.log(`fetched ${all.length}, ${newOnes} new unique`);
}

console.log(`\nTotal unique records: ${allRecords.size}`);

// ---- classify ----
const byProv = {};
const alreadyInVma = [];
const newCandidates = [];
for (const r of allRecords.values()) {
  const p = r.provenance || '(unknown)';
  byProv[p] = (byProv[p] || 0) + 1;
  if (r.ark && existingArks.has(r.ark)) alreadyInVma.push(r);
  else newCandidates.push(r);
}

console.log(`\n--- By provenance ---`);
for (const [p, c] of Object.entries(byProv).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(c).padStart(4)}  ${p}`);

console.log(`\n--- Status ---`);
console.log(`  already in VMA:  ${alreadyInVma.length}`);
console.log(`  new candidates:  ${newCandidates.length}`);

// ---- date histogram (parse first 4-digit year) ----
const decade = {};
for (const r of newCandidates) {
  const ys = r.date.join(' ').match(/\b(1[5-9]\d\d|20\d\d)\b/);
  const d = ys ? Math.floor(parseInt(ys[1]) / 10) * 10 : null;
  const key = d ? `${d}s` : '(no year)';
  decade[key] = (decade[key] || 0) + 1;
}
console.log(`\n--- New candidates by decade ---`);
for (const [d, c] of Object.entries(decade).sort()) console.log(`  ${d.padEnd(8)} ${'█'.repeat(Math.min(c, 50))} ${c}`);

// ---- sample candidates ----
console.log(`\n--- Sample new candidates (first 12) ---`);
for (const r of newCandidates.slice(0, 12)) {
  console.log(`  [${r.date[0] || '?'}] ${(r.title[0] || '(no title)').slice(0, 80)}`);
  console.log(`        ark=${r.ark || '-'}  prov=${r.provenance || '-'}`);
}

const out = `scripts/scout_results_${Date.now()}.json`;
writeFileSync(out, JSON.stringify({
  keywords: KEYWORDS,
  totalUnique: allRecords.size,
  byProvenance: byProv,
  alreadyInVma: alreadyInVma.length,
  newCandidates,
  alreadyInVma_records: alreadyInVma,
}, null, 2));
console.log(`\nSaved: ${out}`);
