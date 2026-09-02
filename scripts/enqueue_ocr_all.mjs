#!/usr/bin/env node
// Queue an `ocr` job for every georeferenced map that has never been OCR'd.
//
//   node --env-file=.env scripts/enqueue_ocr_all.mjs [--dry] [--force] [--limit N]
//
// Label search (`/api/search?include=labels`, mig 065) is only as good as the
// share of the corpus that has extractions, and measured on 2026-09-02 that was
// one map. This inserts the same `pipeline_jobs` row `/api/admin/maps/[id]/ocr`
// does, with the same defaults, then the worker drains it:
//   source work/ocr/.venv/bin/activate && python work/worker/vma_worker.py
//
// --force also re-queues maps that already have extractions (new run_id).
// The one-live-job index turns a duplicate into a skipped row, never a second job.

import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const force = args.includes('--force');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx > -1 ? Number(args[limitIdx + 1]) : Infinity;

const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const { data: maps, error } = await db
  .from('maps')
  .select('id, name, year, iiif_image')
  .eq('georef_done', true)
  .not('iiif_image', 'is', null)
  .order('year');
if (error) throw error;

const { data: done } = await db.from('ocr_extractions').select('map_id').limit(100000);
const hasOcr = new Set((done ?? []).map((r) => r.map_id));

const { data: live } = await db
  .from('pipeline_jobs')
  .select('map_id')
  .eq('kind', 'ocr')
  .in('status', ['queued', 'claimed', 'running']);
const inFlight = new Set((live ?? []).map((r) => r.map_id));

const todo = maps
  .filter((m) => !inFlight.has(m.id) && (force || !hasOcr.has(m.id)))
  .slice(0, limit);

console.log(
  `${maps.length} georeferenced · ${hasOcr.size} already OCR'd · ${inFlight.size} in flight → ${todo.length} to queue${dry ? ' (dry run)' : ''}`
);

let queued = 0;
for (const m of todo) {
  console.log(`  ${m.year ?? '????'}  ${m.name}`);
  if (dry) continue;
  // Per map, not per second: a shared run_id would collapse every map's run
  // summary into one and break `--ocr-run-id` seeding for segmentation.
  const run_id = `${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}-${m.id.slice(0, 8)}`;
  const { error: insErr } = await db.from('pipeline_jobs').insert({
    kind: 'ocr',
    map_id: m.id,
    payload: {
      run_id,
      tile_size: 2400,
      overlap: 600,
      concurrency: 3,
      min_confidence: 0.5,
      auto: true,
    },
  });
  if (insErr && insErr.code !== '23505') throw insErr; // 23505 = one-live-job index, already queued
  if (!insErr) queued++;
}
if (!dry) console.log(`queued ${queued}`);
