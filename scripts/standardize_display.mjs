#!/usr/bin/env node
// Standardize and fill display columns on maps: location, map_type, year_label.
// Usage: node scripts/standardize_display.mjs [--apply]

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim())).filter(([k]) => k)
);
const sb = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const apply = process.argv.includes('--apply');

const TONKIN_COLLECTION = 'Indochine 1:25,000 — Tonkin & Thanh Hóa';

function standardizeLocation(m) {
  if (m.location === 'Sài Gòn') return 'Saigon-HCMC';
  if (!m.location) {
    if (m.collection === TONKIN_COLLECTION) return 'Tonkin';
    if (/sài gòn|saigon/i.test(m.name)) return 'Saigon-HCMC';
    if (/hà nội|hanoi|hanoï/i.test(m.name)) return 'Hanoi';
    if (/huế|hue/i.test(m.name)) return 'Huế';
  }
  return m.location;
}

function standardizeMapType(m) {
  if (m.map_type) return m.map_type;
  // Specific overrides for non-plan empties
  if (/1:50,000/.test(m.name) || /topograph/i.test(m.name)) return 'topographic';
  if (/route|routière|itinerai/i.test(m.name)) return 'route';
  if (/cochinchine (francaise|administrative)/i.test(m.name)) return 'regional';
  if (/^carte du sud-vietnam/i.test(m.name)) return 'regional';
  if (/province de/i.test(m.name)) return 'regional';
  // Default: city/area plan
  return 'plan';
}

function standardizeYearLabel(m) {
  if (m.year_label && m.year_label.trim()) return m.year_label;
  if (m.year) return String(m.year);
  return m.year_label;
}

const { data: maps } = await sb.from('maps').select('id, name, year, year_label, location, map_type, collection');
const changes = [];
for (const m of maps) {
  const upd = {};
  const newLoc = standardizeLocation(m);
  const newType = standardizeMapType(m);
  const newYL = standardizeYearLabel(m);
  if (newLoc !== m.location) upd.location = newLoc;
  if (newType !== m.map_type) upd.map_type = newType;
  if (newYL !== m.year_label) upd.year_label = newYL;
  if (Object.keys(upd).length) changes.push({ m, upd });
}

console.log(`${changes.length} maps would change (of ${maps.length})\n`);
const dim = (k) => {
  const t = {};
  for (const { m, upd } of changes) {
    if (k in upd) {
      const key = `${m[k] ?? '(empty)'} → ${upd[k]}`;
      t[key] = (t[key] || 0) + 1;
    }
  }
  return t;
};
for (const f of ['location', 'map_type', 'year_label']) {
  const t = dim(f);
  if (!Object.keys(t).length) continue;
  console.log(`${f}:`);
  for (const [k, v] of Object.entries(t).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
}

if (!apply) { console.log('\nDRY-RUN — pass --apply to write.'); process.exit(0); }

let ok = 0, fail = 0;
for (const { m, upd } of changes) {
  const { error } = await sb.from('maps').update(upd).eq('id', m.id);
  if (error) { console.error(`  ✗ ${m.id}: ${error.message}`); fail++; } else ok++;
}
console.log(`\nApplied: ${ok} ok, ${fail} failed.`);
