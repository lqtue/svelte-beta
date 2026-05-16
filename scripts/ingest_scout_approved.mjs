#!/usr/bin/env node
// Ingest approved scout candidates into Supabase as draft maps.
// Reads scripts/scout_review.csv, processes rows where action='y',
// fetches full manifest metadata for richer DC fields, then inserts.
//
// Default: DRY-RUN (no writes). Pass --apply to actually insert.
//
// Usage:
//   node scripts/ingest_scout_approved.mjs                     # dry-run
//   node scripts/ingest_scout_approved.mjs --apply             # insert
//   node scripts/ingest_scout_approved.mjs --csv path/to.csv   # alternate CSV

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim())).filter(([k]) => k)
);
const SUPABASE_URL = env.PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY;
const APPLY = process.argv.includes('--apply');
const cidx = process.argv.indexOf('--csv');
const CSV_PATH = cidx > -1 ? process.argv[cidx + 1] : 'scripts/scout_review.csv';
const UA = 'Mozilla/5.0 VMA-Ingest/1.0';

// ---- naive CSV parser (handles quoted cells with commas/quotes) ----
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i+1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c === '\r') {}
      else cell += c;
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift();
  return rows.filter(r => r.length === headers.length).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

async function sb(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...opts.headers },
    ...opts,
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

async function fetchManifestMeta(manifestUrl) {
  if (!manifestUrl) return {};
  try {
    const r = await fetch(manifestUrl, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) return {};
    const m = await r.json();
    // Reuse the same flatten logic — gracefully degrade if not IIIF v2
    const meta = m.metadata || [];
    const out = {};
    for (const item of meta) {
      let v = item.value;
      if (Array.isArray(v)) v = v.map(x => x?.['@value'] || x).join(' | ');
      else if (typeof v === 'object' && v?.['@value']) v = v['@value'];
      if (typeof item.label === 'string') out[item.label] = v;
    }
    return {
      manifestRaw: out,
      attribution: m.attribution || null,
      license: m.license || null,
      thumbnail: typeof m.thumbnail === 'string' ? m.thumbnail : m.thumbnail?.['@id'] || null,
      imageService: extractImageService(m),
    };
  } catch { return {}; }
}
function extractImageService(m) {
  try {
    const seq = m.sequences?.[0];
    const canvas = seq?.canvases?.[0];
    const img = canvas?.images?.[0];
    const svc = img?.resource?.service;
    return svc?.['@id'] || img?.resource?.['@id'] || null;
  } catch { return null; }
}

function buildInsertPayload(csvRow, manifestData) {
  const m = manifestData.manifestRaw || {};
  let shelfmark = m['Shelfmark'] || null;
  if (shelfmark) shelfmark = shelfmark.replace(/^Bibliothèque nationale de France,?\s*/, '').replace(/^département\s+/, '').trim();
  let creator = m['Creator'] || csvRow.creator || null;
  if (creator) creator = creator.split(' | ')[0].replace(/\.\s*(Auteur du texte|Collaborateur|Dessinateur|Graveur|Cartographe|Éditeur|éditeur)\s*$/i, '').trim();
  let format = m['Format'] || null;
  if (format) format = format.split(' | ').filter(x => !x.match(/^image\/|Nombre total/)).join(' ; ');

  // Source type from holding institution
  const holder = csvRow.holding_institution || '';
  const source_type =
    holder.includes('David Rumsey') ? 'rumsey'
    : holder.includes('Bibliothèque nationale de France') ? 'bnf'
    : holder.includes('Library of Congress') ? 'other'
    : holder.includes('Bordeaux') || holder.includes('Sorbonne') || holder.includes('Paris') ? 'other'
    : 'other';

  return {
    name: (csvRow.title || '(untitled)').slice(0, 240),
    year: csvRow.year ? Number(csvRow.year) : null,
    year_label: m['Date'] || csvRow.year || null,
    status: 'draft',
    source_type,
    holding_institution: holder || null,
    collection: m['Repository'] === 'Bibliothèque nationale de France' && (m['Shelfmark'] || '').includes('Cartes et plans')
      ? 'Département Cartes et plans'
      : null,
    shelfmark,
    original_title: m['Title'] || csvRow.title || null,
    creator,
    dc_publisher: m['Publisher'] || null,
    language: m['Language'] || (source_type === 'bnf' ? 'français' : null),
    rights: manifestData.license || m['Rights'] || csvRow.reasons?.includes('public') ? null : null,
    physical_description: format,
    iiif_manifest: csvRow.manifestUrl || null,
    iiif_image: manifestData.imageService || null,
    thumbnail: manifestData.thumbnail || null,
    source_url: csvRow.sourceUrl || null,
    extra_metadata: {
      scout_source: csvRow.source,
      scout_category: csvRow.category,
      scout_externalId: csvRow.externalId,
      scout_foundVia: csvRow.foundVia,
    },
  };
}

// ---- main ----
const csvText = readFileSync(CSV_PATH, 'utf8');
const rows = parseCSV(csvText);
const approved = rows.filter(r => (r.action || '').toLowerCase().trim() === 'y');

console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`CSV: ${CSV_PATH}`);
console.log(`Total rows: ${rows.length}`);
console.log(`Approved (action=y): ${approved.length}\n`);

if (!approved.length) {
  console.log('Nothing to ingest. Mark rows with "y" in the action column.');
  process.exit(0);
}

const previews = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

for (let i = 0; i < approved.length; i++) {
  const row = approved[i];
  process.stdout.write(`  [${i+1}/${approved.length}] ${row.source.padEnd(8)} ${(row.title || '').slice(0, 60).padEnd(60)} ... `);
  let manifestData = {};
  if (row.manifestUrl) manifestData = await fetchManifestMeta(row.manifestUrl);
  const payload = buildInsertPayload(row, manifestData);
  previews.push(payload);
  console.log(`${payload.original_title ? '✓ enriched' : '○ no manifest'}`);
  // Rate-limit polite delay (BnF needs more)
  await sleep(row.source === 'gallica' ? 2000 : 400);
}

const previewPath = `scripts/ingest_preview_${Date.now()}.json`;
writeFileSync(previewPath, JSON.stringify(previews, null, 2));
console.log(`\nFull payload preview: ${previewPath}`);

if (!APPLY) {
  console.log(`\nDry-run only — sample payload:`);
  console.log(JSON.stringify(previews[0], null, 2).slice(0, 1200));
  console.log(`\nRe-run with --apply to insert ${previews.length} rows.`);
  process.exit(0);
}

console.log(`\nInserting ${previews.length} rows...`);
let ok = 0, fail = 0;
for (const p of previews) {
  try {
    await sb('/maps', { method: 'POST', body: JSON.stringify(p) });
    ok++;
  } catch (e) {
    fail++;
    console.log(`  FAIL: ${p.name.slice(0, 50)} — ${e.message.slice(0, 120)}`);
  }
}
console.log(`\nInserted: ${ok} ok, ${fail} failed.`);
