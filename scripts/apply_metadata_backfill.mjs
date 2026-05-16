#!/usr/bin/env node
// Apply standardized metadata from the audit JSON back to Supabase.
// Default: DRY-RUN — prints planned PATCHes. Pass --apply to actually write.
//
// Sources of values:
//   1. Hosted maps (bnf, ia)        : scripts/metadata_audit_<latest>.json
//   2. SGI self-hosted (62 maps)    : hardcoded constants
//                                     (creator + dc_publisher + holding_institution
//                                      + language + rights — confirmed by user)
//
// Usage:
//   node scripts/apply_metadata_backfill.mjs                    # dry-run
//   node scripts/apply_metadata_backfill.mjs --apply            # write
//   node scripts/apply_metadata_backfill.mjs --report <path>    # specific audit file
//   node scripts/apply_metadata_backfill.mjs --only sgi|hosted  # subset

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim())).filter(([k]) => k)
);
const SUPABASE_URL = env.PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY;
const APPLY = process.argv.includes('--apply');
const ridx = process.argv.indexOf('--report');
const oidx = process.argv.indexOf('--only');
const ONLY = oidx > -1 ? process.argv[oidx + 1] : 'all';

const reportPath = ridx > -1
  ? process.argv[ridx + 1]
  : readdirSync('scripts').filter(f => f.startsWith('metadata_audit_') && f.endsWith('.json')).sort().pop().replace(/^/, 'scripts/');

console.log(`Mode: ${APPLY ? 'APPLY (writes)' : 'DRY-RUN (no writes)'}`);
console.log(`Audit report: ${reportPath}`);
console.log(`Scope: ${ONLY}\n`);

async function sb(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...opts.headers,
    },
    ...opts,
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

// ---- 1. Hosted maps (from audit JSON) ----
const FIELDS_TO_BACKFILL = [
  'original_title', 'creator', 'year_label', 'shelfmark', 'rights',
  'language', 'physical_description', 'holding_institution',
];

function chooseAuthoritative(entry) {
  // Prefer: BnF origin > Humazur origin > UT Austin pattern > direct fetched
  if (entry.fetched?.bnf_origin_data) return entry.fetched.bnf_origin_data;
  if (entry.fetched?.humazur_origin_data) return entry.fetched.humazur_origin_data;
  if (entry.fetched?.utaustin_origin_data) return entry.fetched.utaustin_origin_data;
  if (entry.fetched && (entry.fetched.holding_institution || entry.fetched.shelfmark)) {
    return entry.fetched;
  }
  return null;
}

function buildHostedPatch(entry) {
  const f = chooseAuthoritative(entry);
  if (!f) return null;
  const patch = {};
  for (const k of FIELDS_TO_BACKFILL) {
    const curr = entry.current[k];
    const next = f[k];
    // Only fill if next is non-empty AND current is empty (no destructive overwrite)
    if (next && (curr == null || String(curr).trim() === '')) patch[k] = next;
  }
  return Object.keys(patch).length ? patch : null;
}

// ---- 2. SGI self-hosted constants ----
const SGI_DEFAULTS = {
  creator: 'Service Géographique de l\'Indochine',
  dc_publisher: 'Service Géographique de l\'Indochine',
  holding_institution: 'Cartomundi (Aix-Marseille Université / CNRS)',
  collection: 'Indochine 1:25,000 — Tonkin & Thanh Hóa',
  language: 'français',
  rights: 'Public domain',
};

async function run() {
  let plannedHosted = [];
  let plannedSgi = [];

  // Hosted
  if (ONLY === 'all' || ONLY === 'hosted') {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    for (const entry of report) {
      const patch = buildHostedPatch(entry);
      if (patch) plannedHosted.push({ id: entry.id, name: entry.name, patch });
    }
  }

  // SGI
  if (ONLY === 'all' || ONLY === 'sgi') {
    const sgi = await sb(`/maps?select=id,name,creator,dc_publisher,holding_institution,collection,language,rights&source_type=eq.self`);
    for (const m of sgi) {
      const patch = {};
      for (const [k, v] of Object.entries(SGI_DEFAULTS)) {
        if (m[k] == null || String(m[k]).trim() === '') patch[k] = v;
      }
      // Special: collection — overwrite only the literal SGI string from old data
      if (m.collection === 'Service Géographique de l\'Indochine') {
        patch.collection = SGI_DEFAULTS.collection;
      }
      if (Object.keys(patch).length) plannedSgi.push({ id: m.id, name: m.name, patch });
    }
  }

  // Print plan
  console.log(`=== HOSTED (${plannedHosted.length} maps) ===`);
  for (const p of plannedHosted.slice(0, 5)) {
    console.log(`  ${p.id.slice(0,8)} ${p.name.slice(0,55)}`);
    for (const [k, v] of Object.entries(p.patch)) console.log(`    + ${k}: ${String(v).slice(0,90)}`);
  }
  if (plannedHosted.length > 5) console.log(`  ... and ${plannedHosted.length - 5} more`);

  console.log(`\n=== SGI (${plannedSgi.length} maps) ===`);
  for (const p of plannedSgi.slice(0, 3)) {
    console.log(`  ${p.id.slice(0,8)} ${p.name.slice(0,55)}`);
    for (const [k, v] of Object.entries(p.patch)) console.log(`    + ${k}: ${String(v).slice(0,90)}`);
  }
  if (plannedSgi.length > 3) console.log(`  ... and ${plannedSgi.length - 3} more`);

  // Save the plan for auditability
  const planPath = `scripts/backfill_plan_${Date.now()}.json`;
  writeFileSync(planPath, JSON.stringify({ hosted: plannedHosted, sgi: plannedSgi }, null, 2));
  console.log(`\nFull plan saved: ${planPath}`);

  if (!APPLY) {
    console.log('\nDry-run only — pass --apply to write.');
    return;
  }

  console.log('\nWriting changes...');
  let ok = 0, fail = 0;
  for (const set of [plannedHosted, plannedSgi]) {
    for (const p of set) {
      try {
        await sb(`/maps?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify(p.patch) });
        ok++;
      } catch (e) {
        fail++;
        console.log(`  FAIL ${p.id.slice(0,8)}: ${e.message.slice(0,120)}`);
      }
    }
  }
  console.log(`\nApplied: ${ok} ok, ${fail} failed.`);
}

run().catch(e => { console.error(e); process.exit(1); });
