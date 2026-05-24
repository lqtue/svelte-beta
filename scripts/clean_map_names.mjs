#!/usr/bin/env node
// Strip trailing year parens and leading "NN." sheet-number prefix from map names.
// Usage: node scripts/clean_map_names.mjs [--apply]

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

function clean(name) {
  if (!name) return name;
  let n = name;
  // Strip leading "NN." or "NN " prefix (sheet numbers).
  n = n.replace(/^\d+[a-z]?\.\s*/i, '');
  // Strip parenthesized years anywhere (1862), (1968), (1876-1883)
  n = n.replace(/\s*\(\s*\d{4}\s*(?:[-–]\s*\d{2,4}\s*)?\)\s*/g, ' ');
  // Strip bare year tokens (1500-2099) when surrounded by separators/spaces.
  n = n.replace(/[,\s][\s,/–—-]*\b(1[5-9]\d{2}|20\d{2})\b\s*[,/–—-]?\s*/g, ' ');
  // Strip lone trailing year if any survived.
  n = n.replace(/\s+\b(1[5-9]\d{2}|20\d{2})\b\s*$/g, '');
  // Cleanup: collapse whitespace, fix " ," → ",", strip trailing junk.
  n = n.replace(/\s+,/g, ',');
  n = n.replace(/\s+/g, ' ');
  n = n.replace(/[\s,;/–—-]+$/, '');
  return n.trim();
}

const { data: maps } = await sb.from('maps').select('id, name');
const changes = maps.filter(m => clean(m.name) !== m.name);
console.log(`${changes.length} maps would change.\n`);
for (const m of changes.slice(0, 50)) console.log(`  "${m.name}"\n  → "${clean(m.name)}"`);
if (changes.length > 50) console.log(`  … and ${changes.length - 50} more`);

if (!apply) { console.log('\nDRY-RUN — pass --apply to write.'); process.exit(0); }
let ok = 0, fail = 0;
for (const m of changes) {
  const { error } = await sb.from('maps').update({ name: clean(m.name) }).eq('id', m.id);
  if (error) { console.error(`✗ ${m.id}: ${error.message}`); fail++; } else ok++;
}
console.log(`\nApplied: ${ok} ok, ${fail} failed.`);
