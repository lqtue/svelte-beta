#!/usr/bin/env node
// Queue an `ocr` job for every georeferenced map that has never been OCR'd.
//
//   node --env-file=.env scripts/enqueue_ocr_all.mjs [--dry] [--force] [--limit N]
//                                                    [--untriaged] [--model NAME]
//
// Label search (`/api/search?include=labels`, mig 065) is only as good as the
// share of the corpus that has extractions, and measured on 2026-09-02 that was
// one map. This inserts the same `pipeline_jobs` row `/api/admin/maps/[id]/ocr`
// does, with the same defaults, then the worker drains it:
//   source work/ocr/.venv/bin/activate && python work/worker/vma_worker.py
//
// --force also re-queues maps that already have extractions (new run_id).
// The one-live-job index turns a duplicate into a skipped row, never a second job.
//
// By default this queues only sheets someone has **saved a triage** for in
// /contribute/digitalize (`maps.triage`, migration 069): the neatline, tile grid
// and per-tile priorities a person decided on, spread into the job payload
// unchanged. That is the deliberate order — triage, look at what you did, then
// queue. `--untriaged` includes the rest, which run in `auto` mode and let the
// scout pass guess the neatline; that is the old behaviour and it is worse.

import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const force = args.includes('--force');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx > -1 ? Number(args[limitIdx + 1]) : Infinity;
const untriaged = args.includes('--untriaged');
const modelIdx = args.indexOf('--model');
const model = modelIdx > -1 ? args[modelIdx + 1] : null;

const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const { data: maps, error } = await db
  .from('maps')
  .select('id, name, year, iiif_image, triage')
  .eq('georef_done', true)
  .not('iiif_image', 'is', null)
  .order('year');
if (error) throw error;

// Which maps already have extractions. `.select('map_id').limit(100000)` was
// wrong: PostgREST caps a response at 1000 rows whatever the limit says, and
// with 1404 extraction rows in the table this saw exactly one of the two
// OCR'd maps and re-queued the other on every run. A grouped count is capped
// by the number of *maps*, not the number of rows.
const hasOcr = new Set();
{
  const { data: rows, error: exErr } = await db
    .from('ocr_extractions')
    .select('map_id')
    .limit(1000);
  if (exErr) throw exErr;
  for (const r of rows ?? []) hasOcr.add(r.map_id);
  // The cap above is a silent truncation, so confirm per map rather than
  // trusting a full-table scan we cannot page cheaply.
  for (const m of maps) {
    if (hasOcr.has(m.id)) continue;
    const { count, error: cErr } = await db
      .from('ocr_extractions')
      .select('*', { count: 'exact', head: true })
      .eq('map_id', m.id);
    if (cErr) throw cErr;
    if (count) hasOcr.add(m.id);
  }
}

const { data: live } = await db
  .from('pipeline_jobs')
  .select('map_id')
  .eq('kind', 'ocr')
  .in('status', ['queued', 'claimed', 'running']);
const inFlight = new Set((live ?? []).map((r) => r.map_id));

// `triage` defaults to `{}`, so a neatline is what tells a saved triage from a
// map nobody has opened.
const triageOf = (m) => (m.triage?.neatline ? m.triage : null);
const nTriaged = maps.filter(triageOf).length;

const todo = maps
  .filter((m) => !inFlight.has(m.id) && (force || !hasOcr.has(m.id)))
  .filter((m) => untriaged || triageOf(m))
  .slice(0, limit);

console.log(
  `${maps.length} georeferenced · ${nTriaged} triaged · ${hasOcr.size} already OCR'd · ` +
    `${inFlight.size} in flight → ${todo.length} to queue${dry ? ' (dry run)' : ''}`
);
if (!untriaged && nTriaged < maps.length) {
  console.log(
    `  ${maps.length - nTriaged} sheets have no saved triage and are skipped. ` +
      `Triage them at /contribute/digitalize, or pass --untriaged to run them in auto mode.`
  );
}

let queued = 0;
for (const m of todo) {
  const t = triageOf(m);
  console.log(`  ${m.year ?? '????'}  ${m.name}${t ? '' : '   (no triage — auto mode)'}`);
  if (dry) continue;
  // Per map, not per second: a shared run_id would collapse every map's run
  // summary into one and break `--ocr-run-id` seeding for segmentation.
  const run_id = `${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}-${m.id.slice(0, 8)}`;
  const { error: insErr } = await db.from('pipeline_jobs').insert({
    kind: 'ocr',
    map_id: m.id,
    payload: {
      run_id,
      tile_size: t?.tile_size ?? 2400,
      overlap: t?.overlap ?? 600,
      concurrency: 3,
      min_confidence: 0.5,
      // A saved neatline is the whole point of triaging: with one, the scout
      // pass has nothing left to guess, so `auto` only still runs the legend.
      auto: true,
      ...(t?.neatline ? { neatline: t.neatline } : {}),
      ...(t?.tile_overrides && Object.keys(t.tile_overrides).length
        ? { tile_overrides: t.tile_overrides }
        : {}),
      ...(model ? { model } : {}),
    },
  });
  if (insErr && insErr.code !== '23505') throw insErr; // 23505 = one-live-job index, already queued
  if (!insErr) queued++;
}
if (!dry) console.log(`queued ${queued}`);
