/**
 * GET /api/context?lng=&lat=&radius=&year_from=&year_to=&limit=
 *
 * Everything the archive knows about a spot: the maps that cover it, the OCR'd
 * labels and reviewed footprints near it, and any story point standing there.
 * The place-time index behind it is `context_at` (migration 066); design notes
 * in `docs/platform-design.md` §0.
 *
 * Public. Anonymous callers see published maps and approved stories only; that
 * gate lives in the RPC, because this route runs on the service client and
 * already knows the caller's role — the same arrangement as `search_labels`.
 *
 * Every item carries `distance_m` and `geom_rmse`, so a caller can tell a
 * metre-accurate 1923 cadastral plan from a 1799 sketch with three GCPs. Rows
 * whose map has no georeference are absent by construction: they have no
 * position to report, and guessing one would be worse than saying nothing.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRole } from '$lib/server/auth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { dbError } from '$lib/server/http';

const DEFAULT_RADIUS_M = 150;
const MAX_RADIUS_M = 5000;

function num(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export const GET: RequestHandler = async ({ locals, url }) => {
  const lng = num(url.searchParams.get('lng'));
  const lat = num(url.searchParams.get('lat'));
  if (lng === null || lat === null || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
    throw error(400, 'lng and lat are required, in degrees');
  }

  const radius = Math.min(
    Math.max(num(url.searchParams.get('radius')) ?? DEFAULT_RADIUS_M, 1),
    MAX_RADIUS_M
  );
  const role = await getRole(locals);

  const { data, error: err } = await adminClient().rpc('context_at', {
    p_lng: lng,
    p_lat: lat,
    p_radius_m: radius,
    p_year_from: num(url.searchParams.get('year_from')) ?? undefined,
    p_year_to: num(url.searchParams.get('year_to')) ?? undefined,
    p_public_only: role !== 'admin' && role !== 'mod',
    p_limit: num(url.searchParams.get('limit')) ?? undefined,
  });
  if (err) dbError(err, 'Context lookup failed');

  return json(data);
};
