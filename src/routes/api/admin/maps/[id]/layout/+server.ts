/**
 * POST /api/admin/maps/[id]/layout — enqueue the layout pass.
 * GET  — the saved regions, plus any layout job still in flight.
 *
 * The pass asks the model, once and at low resolution, what the sheet is made
 * of: the main map, the title block, the legend, an index of street names, an
 * inset, and the furniture worth skipping. It writes the answer to
 * `maps.triage.regions`, where the digitalize canvas draws it for a person to
 * correct before any tile is read.
 *
 * A job rather than a route that calls Gemini itself, because the Gemini key
 * lives on the worker and deliberately not in the web app — the same reason
 * `ocr` is a job. The worker runs `ocr.py scout --save-triage`.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/auth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid, dbError } from '$lib/server/http';
import type { SavedTriage } from '$lib/data/maps/triageTypes';

export const POST: RequestHandler = async ({ locals, params, request }) => {
  await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');
  const body = await request.json().catch(() => ({}));

  const payload = {
    run_id: body.run_id ?? new Date().toISOString().replace(/[:.]/g, '').slice(0, 15),
    // 2048 for the same reason OVERVIEW_WIDTH is: below it the density read
    // inverts, and a model looking for a legend needs to see that it is ruled.
    render_size: Number(body.render_size) || 2048,
    ...(typeof body.model === 'string' && body.model ? { model: body.model } : {}),
  };

  const supabase = adminClient();
  const { data: map } = await supabase
    .from('maps')
    .select('id, iiif_image')
    .eq('id', mapId)
    .single();

  if (!map) throw error(404, 'Map not found');
  if (!map.iiif_image) throw error(400, 'Map has no iiif_image — cannot read the layout');

  const { data: job, error: err } = await supabase
    .from('pipeline_jobs')
    .insert({ kind: 'layout', map_id: mapId, payload })
    .select('id, status')
    .single();

  // idx_pipeline_jobs_one_live: this map already has a layout job in flight.
  if (err?.code === '23505') {
    const { data: existing } = await supabase
      .from('pipeline_jobs')
      .select('status')
      .eq('kind', 'layout')
      .eq('map_id', mapId)
      .in('status', ['queued', 'claimed', 'running'])
      .maybeSingle();
    throw error(409, `A layout job for this map is already ${existing?.status ?? 'in flight'}`);
  }
  if (err) dbError(err, 'Could not enqueue the layout job');

  return json({ job_id: job!.id, map_id: mapId, status: job!.status }, { status: 202 });
};

export const GET: RequestHandler = async ({ locals, params }) => {
  await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');

  const supabase = adminClient();
  const { data: map, error: err } = await supabase
    .from('maps')
    .select('triage')
    .eq('id', mapId)
    .single();
  if (err) dbError(err, 'Could not read the triage');
  if (!map) throw error(404, 'Map not found');

  const triage = (map.triage as SavedTriage) ?? {};

  const { data: job } = await supabase
    .from('pipeline_jobs')
    .select('id, status, worker, error, created_at, finished_at')
    .eq('kind', 'layout')
    .eq('map_id', mapId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return json({
    map_id: mapId,
    regions: triage.regions ?? [],
    regions_at: triage.regions_at ?? null,
    job: job ?? null,
  });
};
