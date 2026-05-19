#!/usr/bin/env node
// Sync maps.georef_done from the Allmaps annotation server.
//
// For every map with allmaps_id set and georef_done = false, probe
// https://annotations.allmaps.org/images/{allmaps_id}. If the annotation
// exists (HTTP 200), flip georef_done = true.
//
// Safe to run repeatedly — idempotent. Intended for cron or manual triggers
// after volunteers georef on the Allmaps Editor.
//
// Usage:
//   node scripts/sync_allmaps_georef.mjs             # dry-run
//   node scripts/sync_allmaps_georef.mjs --apply     # write
//   node scripts/sync_allmaps_georef.mjs --map-id <id> [--apply]
//   node scripts/sync_allmaps_georef.mjs --include-done   # also re-check done rows

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const includeDone = args.includes('--include-done');
const mapIdIdx = args.indexOf('--map-id');
const onlyMapId = mapIdIdx >= 0 ? args[mapIdIdx + 1] : null;

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function probeAnnotation(allmapsId) {
  try {
    const res = await fetch(`https://annotations.allmaps.org/images/${allmapsId}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  let q = sb.from('maps')
    .select('id, name, allmaps_id, georef_done')
    .not('allmaps_id', 'is', null);
  if (!includeDone) q = q.eq('georef_done', false);
  if (onlyMapId) q = q.eq('id', onlyMapId);
  const { data: rows, error } = await q;
  if (error) throw error;
  if (!rows?.length) {
    console.log('No candidates.');
    return;
  }

  console.log(`Probing ${rows.length} map(s).`);
  console.log(apply ? 'APPLY mode — flipping georef_done on hits.' : 'DRY-RUN — pass --apply to write.\n');

  let hits = 0;
  let writes = 0;
  for (const r of rows) {
    const ok = await probeAnnotation(r.allmaps_id);
    if (!ok) continue;
    hits++;
    const needsWrite = !r.georef_done;
    const marker = needsWrite ? '→ flip' : '(already done)';
    console.log(`  ✓ ${r.name}  [${r.allmaps_id}]  ${marker}`);
    if (apply && needsWrite) {
      const { error: updErr } = await sb.from('maps').update({ georef_done: true }).eq('id', r.id);
      if (updErr) console.log(`    ⚠ write failed: ${updErr.message}`);
      else { writes++; console.log('    ✓ georef_done = true'); }
    }
  }

  console.log(`\nDone. ${hits} annotation(s) found, ${writes} row(s) updated.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
