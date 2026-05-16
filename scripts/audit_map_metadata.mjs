#!/usr/bin/env node
// Audit map metadata for standardization opportunities.
// Read-only: prints a report of field coverage, distinct values, and inconsistencies.
//
// Usage: node scripts/audit_map_metadata.mjs

import { readFileSync } from 'fs';
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

async function sb(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'count=exact',
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const CORE_DC = [
  'original_title', 'creator', 'dc_publisher', 'year_label',
  'shelfmark', 'source_url', 'rights', 'dc_description',
];
const SUPP_DC = [
  'dc_subject', 'dc_coverage', 'language', 'physical_description', 'collection',
];
const IDENTITY = ['name', 'location', 'year', 'map_type', 'source_type', 'status'];
const ALL_FIELDS = [...IDENTITY, ...CORE_DC, ...SUPP_DC, 'allmaps_id', 'iiif_image', 'iiif_manifest', 'thumbnail', 'bbox', 'extra_metadata', 'is_featured'];

const cols = ['id', ...ALL_FIELDS].join(',');
const maps = await sb(`/maps?select=${cols}&order=created_at.asc`);

console.log(`\n=== MAP METADATA AUDIT ===`);
console.log(`Total maps: ${maps.length}\n`);

// 1. Field coverage
console.log(`--- Field coverage (% non-null/non-empty) ---`);
const cov = {};
for (const f of ALL_FIELDS) {
  const filled = maps.filter(m => {
    const v = m[f];
    if (v === null || v === undefined) return false;
    if (typeof v === 'string' && v.trim() === '') return false;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  }).length;
  cov[f] = filled;
}
const fmt = (n) => `${String(n).padStart(3)}/${maps.length} (${String(Math.round(100 * n / maps.length)).padStart(3)}%)`;
console.log('\nIDENTITY:');
for (const f of IDENTITY) console.log(`  ${f.padEnd(28)} ${fmt(cov[f])}`);
console.log('\nCORE DUBLIN CORE:');
for (const f of CORE_DC) console.log(`  ${f.padEnd(28)} ${fmt(cov[f])}`);
console.log('\nSUPPLEMENTARY DC:');
for (const f of SUPP_DC) console.log(`  ${f.padEnd(28)} ${fmt(cov[f])}`);
console.log('\nHOSTING:');
for (const f of ['allmaps_id', 'iiif_image', 'iiif_manifest', 'thumbnail', 'bbox', 'extra_metadata', 'is_featured']) {
  console.log(`  ${f.padEnd(28)} ${fmt(cov[f])}`);
}

// 2. Distinct values for low-cardinality fields
console.log(`\n--- Distinct values (controlled vocab fields) ---`);
for (const f of ['map_type', 'source_type', 'status', 'collection', 'language', 'rights', 'creator', 'dc_publisher']) {
  const counts = {};
  for (const m of maps) {
    const v = m[f] == null || m[f] === '' ? '(empty)' : String(m[f]);
    counts[v] = (counts[v] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  console.log(`\n${f} (${entries.length} distinct):`);
  for (const [v, c] of entries.slice(0, 20)) {
    console.log(`  ${String(c).padStart(3)}  ${v.slice(0, 100)}`);
  }
  if (entries.length > 20) console.log(`  ... and ${entries.length - 20} more`);
}

// 3. year_label vs year consistency
console.log(`\n--- year vs year_label consistency ---`);
let yMatch = 0, yMismatch = 0, yOnlyLabel = 0, yOnlyNum = 0, yBoth = 0;
const mismatches = [];
for (const m of maps) {
  const hasY = m.year != null;
  const hasL = m.year_label && String(m.year_label).trim() !== '';
  if (hasY && hasL) {
    yBoth++;
    const numInLabel = String(m.year_label).match(/\b(1[5-9]\d\d|20\d\d)\b/);
    if (numInLabel && parseInt(numInLabel[1]) === m.year) yMatch++;
    else { yMismatch++; mismatches.push(`  [${m.id.slice(0, 8)}] year=${m.year}  label="${m.year_label}"`); }
  } else if (hasY) yOnlyNum++;
  else if (hasL) yOnlyLabel++;
}
console.log(`  both fields:     ${yBoth}  (match: ${yMatch}, mismatch: ${yMismatch})`);
console.log(`  year only:       ${yOnlyNum}`);
console.log(`  year_label only: ${yOnlyLabel}`);
if (mismatches.length) {
  console.log(`  mismatches:`);
  for (const line of mismatches.slice(0, 15)) console.log(line);
  if (mismatches.length > 15) console.log(`  ... and ${mismatches.length - 15} more`);
}

// 4. extra_metadata key frequency
console.log(`\n--- extra_metadata keys (consolidation candidates) ---`);
const keyCount = {};
for (const m of maps) {
  if (m.extra_metadata && typeof m.extra_metadata === 'object') {
    for (const k of Object.keys(m.extra_metadata)) keyCount[k] = (keyCount[k] || 0) + 1;
  }
}
const keys = Object.entries(keyCount).sort((a, b) => b[1] - a[1]);
if (!keys.length) console.log('  (no extra_metadata anywhere)');
for (const [k, c] of keys) console.log(`  ${String(c).padStart(3)}  ${k}`);

// 5. Suspicious / non-canonical values
console.log(`\n--- Suspicious values ---`);
const ALLOWED_SOURCE = new Set(['ia', 'bnf', 'efeo', 'gallica', 'rumsey', 'self', 'r2', 'other']);
const ALLOWED_STATUS = new Set(['draft', 'public', 'featured']);
const issues = [];
for (const m of maps) {
  if (m.source_type && !ALLOWED_SOURCE.has(m.source_type))
    issues.push(`  [${m.id.slice(0, 8)}] source_type="${m.source_type}" not in canonical set`);
  if (m.status && !ALLOWED_STATUS.has(m.status))
    issues.push(`  [${m.id.slice(0, 8)}] status="${m.status}" not in canonical set`);
  if (m.name && (m.name.match(/^\d+\s/) || m.name.match(/\.(jpg|png|tif)$/i)))
    issues.push(`  [${m.id.slice(0, 8)}] name looks like a filename: "${m.name}"`);
  if (m.location && m.location.length > 80)
    issues.push(`  [${m.id.slice(0, 8)}] location very long (${m.location.length} chars)`);
}
if (!issues.length) console.log('  (none)');
for (const line of issues.slice(0, 40)) console.log(line);
if (issues.length > 40) console.log(`  ... and ${issues.length - 40} more`);

// 6. Completeness distribution
console.log(`\n--- Completeness (CORE DC fields filled per map) ---`);
const bucket = {};
for (const m of maps) {
  const n = CORE_DC.filter(f => m[f] != null && String(m[f]).trim() !== '').length;
  bucket[n] = (bucket[n] || 0) + 1;
}
for (let i = 0; i <= CORE_DC.length; i++) {
  const n = bucket[i] || 0;
  console.log(`  ${i}/${CORE_DC.length} core fields: ${String(n).padStart(3)}  ${'█'.repeat(n)}`);
}

console.log('\n=== end audit ===\n');
