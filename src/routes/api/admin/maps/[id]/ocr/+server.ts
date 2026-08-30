/**
 * POST /api/admin/maps/[id]/ocr
 *
 * Triggers the Python OCR batch pipeline for a map.
 * Spawns: python work/ocr/scripts/ocr.py batch --map-id <id> --db
 *
 * NOTE: Uses child_process — only works in local dev (npm run dev).
 * Not available in Cloudflare Workers (production). Use the CLI directly
 * for production runs:
 *   python work/ocr/scripts/ocr.py batch --map-id <id> --db
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/auth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid, dbError } from '$lib/server/http';

export const POST: RequestHandler = async ({ locals, params, request }) => {
  await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');

  const body = await request.json().catch(() => ({}));
  const runId: string = body.run_id ?? new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const tileSize: number = body.tile_size ?? 2400;
  const overlap: number = body.overlap ?? 600;
  const concurrency: number = body.concurrency ?? 3;
  const minConfidence: number = body.min_confidence ?? 0.5;
  const neatline: number[] | undefined =
    Array.isArray(body.neatline) && body.neatline.length === 4 ? body.neatline : undefined;
  const targetCalls: number | undefined = body.target_calls ? Number(body.target_calls) : undefined;
  const priorRun: string | undefined = body.prior_run ?? undefined;
  const tileOverrides: Record<string, string> | undefined =
    body.tile_overrides && typeof body.tile_overrides === 'object'
      ? body.tile_overrides
      : undefined;

  // Verify map exists and has an IIIF image
  const { data: map } = await adminClient()
    .from('maps')
    .select('id, name, iiif_image')
    .eq('id', mapId)
    .single();

  if (!map) throw error(404, 'Map not found');
  if (!map.iiif_image) throw error(400, 'Map has no iiif_image — cannot run OCR');

  // Build the CLI args list (used for both spawn and CLI-command fallback)
  const cliArgs = [
    'batch',
    '--map-id',
    mapId,
    '--tile-size',
    String(tileSize),
    '--overlap',
    String(overlap),
    '--concurrency',
    String(concurrency),
    '--min-confidence',
    String(minConfidence),
    '--run-id',
    runId,
    '--db',
  ];
  if (neatline) cliArgs.push('--crop', neatline.join(','));
  // Fully automated chain (default on): scout neatline + auto legend extract.
  // Stops at stage 'ocr_done' — extractions land pending for human review.
  const auto: boolean = body.auto !== false;
  if (auto) {
    if (!neatline) cliArgs.push('--scout'); // manual --crop already pins the neatline
    cliArgs.push('--legend');
  }
  if (targetCalls) cliArgs.push('--target-calls', String(targetCalls));
  if (priorRun) cliArgs.push('--prior-run', priorRun);
  if (tileOverrides && Object.keys(tileOverrides).length > 0) {
    cliArgs.push('--tile-overrides', JSON.stringify(tileOverrides));
  }

  // child_process only available in Node.js (local dev), not Cloudflare Workers
  // ponytail: node: prefix is required — bare 'child_process'/'path' fail the
  // Cloudflare Pages Functions bundle step (esbuild can't resolve them).
  let spawnFn: typeof import('node:child_process').spawn | null = null;
  try {
    ({ spawn: spawnFn } = await import('node:child_process'));
  } catch {
    // Production: return the exact CLI command so the user can run it locally.
    // NOTE: this is the one route that signals failure in the body rather than
    // by throwing — the admin UI branches on `cli_only`. Keep the shape.
    const cliCommand = `source .venv/bin/activate && python work/ocr/scripts/ocr.py ${cliArgs.join(' ')}`;
    return json(
      {
        ok: false,
        cli_only: true,
        cli_command: cliCommand,
        message: 'OCR must be run locally — copy the command below',
      },
      { status: 422 }
    );
  }

  const { resolve } = await import('node:path');
  const repoRoot = resolve('.');
  const pythonBin = resolve(repoRoot, '.venv/bin/python');
  const script = resolve(repoRoot, 'work/ocr/scripts/ocr.py');

  // Detached so the process outlives the HTTP request
  const child = spawnFn(pythonBin, [script, ...cliArgs], {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  console.log(`[OCR] started PID ${child.pid} run_id=${runId} map=${mapId}`);

  return json({ run_id: runId, map_id: mapId, status: 'started' }, { status: 202 });
};

/** GET — return existing OCR extractions count for this map */
export const GET: RequestHandler = async ({ locals, params, url }) => {
  await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');
  const runId = url.searchParams.get('run_id');

  let query = adminClient()
    .from('ocr_extractions')
    .select('run_id, category, confidence', { count: 'exact' })
    .eq('map_id', mapId);

  if (runId) query = query.eq('run_id', runId);

  const { data, count, error: err } = await query;
  if (err) dbError(err, 'Could not read OCR extractions');

  // Summarise by run_id
  const runs: Record<string, { n: number; categories: Record<string, number> }> = {};
  for (const row of data ?? []) {
    if (!runs[row.run_id]) runs[row.run_id] = { n: 0, categories: {} };
    runs[row.run_id].n++;
    runs[row.run_id].categories[row.category] =
      (runs[row.run_id].categories[row.category] ?? 0) + 1;
  }

  return json({ map_id: mapId, total: count ?? 0, runs });
};
