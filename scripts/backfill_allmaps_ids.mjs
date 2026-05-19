#!/usr/bin/env node
// Backfill maps.allmaps_id for any row that has an iiif_image but no
// allmaps_id. Re-derives the 16-char Allmaps image ID (SHA-1 hex first 16)
// from the canonical IIIF image service URL via @allmaps/id.
//
// Usage:
//   node scripts/backfill_allmaps_ids.mjs              # dry-run
//   node scripts/backfill_allmaps_ids.mjs --apply       # write
//   node scripts/backfill_allmaps_ids.mjs --map-id <id> [--apply]

import { createClient } from '@supabase/supabase-js';
import { generateId } from '@allmaps/id';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const mapIdIdx = args.indexOf('--map-id');
const onlyMapId = mapIdIdx >= 0 ? args[mapIdIdx + 1] : null;

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function probeAnnotation(allmapsId) {
  try {
    const res = await fetch(`https://annotations.allmaps.org/images/${allmapsId}`, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  let q = sb.from('maps')
    .select('id, name, iiif_image, allmaps_id, annotation_url')
    .is('allmaps_id', null)
    .not('iiif_image', 'is', null);
  if (onlyMapId) q = q.eq('id', onlyMapId);
  const { data: rows, error } = await q;
  if (error) throw error;
  if (!rows?.length) {
    console.log('No candidates found. Nothing to do.');
    return;
  }

  console.log(`Found ${rows.length} candidate row(s).`);
  console.log(apply ? 'APPLY mode — writing changes.' : 'DRY-RUN — pass --apply to write.\n');

  for (const r of rows) {
    const canonical = r.iiif_image.replace(/\/(info\.json)?$/, '').replace(/\/+$/, '');
    let derivedId;
    try {
      derivedId = await generateId(canonical);
    } catch (e) {
      console.log(`  ✗ ${r.name} — failed to derive ID: ${e.message}`);
      continue;
    }
    const hasAnnotation = await probeAnnotation(derivedId);
    const note = hasAnnotation ? 'annotation server has it' : 'NOT yet on Allmaps annotation server';
    console.log(`  ${r.name}\n    iiif_image: ${canonical}\n    derived:    ${derivedId}  (${note})`);

    if (apply) {
      const { error: updErr } = await sb.from('maps').update({ allmaps_id: derivedId }).eq('id', r.id);
      if (updErr) console.log(`    ⚠ write failed: ${updErr.message}`);
      else console.log('    ✓ allmaps_id written');
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
