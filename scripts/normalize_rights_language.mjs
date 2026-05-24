#!/usr/bin/env node
// Normalize maps.rights and maps.language to canonical values.
// Usage: node scripts/normalize_rights_language.mjs [--apply]

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

// Title-based language heuristics for rows with empty language
const ENGLISH_TITLES = [
  /^Map of /i, /^Town Plan/i, /Việt Nam City Maps/i, /Việt Nam 1:50,000/i,
];
const VIETNAMESE_TITLES = [/Đô thành/i, /^Sài Gòn /i];

function normRights(curr) {
  if (!curr || curr.trim() === '') return 'Public domain';
  const s = curr.trim();
  if (s === 'Domaine public') return 'Public domain';
  if (s.includes('gallica.bnf.fr/html')) return 'Public domain';
  return s; // keep "Public domain", "Public domain (U.S. Government work)"
}

function normLanguage(curr, name) {
  if (curr && curr.trim()) {
    const s = curr.trim().toLowerCase();
    if (s === 'français' || s === 'french') return 'fr';
    if (s === 'english') return 'en';
    if (s === 'vietnamese' || s === 'tiếng việt') return 'vi';
    return s; // already a code or unknown
  }
  // empty — infer from name
  if (ENGLISH_TITLES.some(re => re.test(name))) return 'en';
  if (VIETNAMESE_TITLES.some(re => re.test(name))) return 'vi';
  return 'fr'; // default for historical Indochina maps
}

const { data: maps } = await sb.from('maps').select('id, name, rights, language');
const changes = [];
for (const m of maps) {
  const newRights = normRights(m.rights);
  const newLang = normLanguage(m.language, m.name);
  const upd = {};
  if (newRights !== m.rights) upd.rights = newRights;
  if (newLang !== m.language) upd.language = newLang;
  if (Object.keys(upd).length) changes.push({ m, upd });
}

console.log(`${changes.length} maps would change (of ${maps.length})\n`);
const rightsDelta = {}, langDelta = {};
for (const { m, upd } of changes) {
  if ('rights' in upd) {
    const k = `${m.rights ?? '(empty)'} → ${upd.rights}`;
    rightsDelta[k] = (rightsDelta[k] || 0) + 1;
  }
  if ('language' in upd) {
    const k = `${m.language ?? '(empty)'} → ${upd.language}`;
    langDelta[k] = (langDelta[k] || 0) + 1;
  }
}
console.log('Rights changes:');
for (const [k, v] of Object.entries(rightsDelta).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log('\nLanguage changes:');
for (const [k, v] of Object.entries(langDelta).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);

if (!apply) { console.log('\nDRY-RUN — pass --apply to write.'); process.exit(0); }

let ok = 0, fail = 0;
for (const { m, upd } of changes) {
  const { error } = await sb.from('maps').update(upd).eq('id', m.id);
  if (error) { console.error(`  ✗ ${m.id}: ${error.message}`); fail++; } else ok++;
}
console.log(`\nApplied: ${ok} ok, ${fail} failed.`);
