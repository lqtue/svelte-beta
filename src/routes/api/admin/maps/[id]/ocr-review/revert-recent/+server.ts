/**
 * Undo the last N minutes of OCR validations for the current reviewer.
 *
 * Thin wrapper: the queries live in `$lib/server/ocrReview`, alongside the
 * validation stamping the sibling `ocr-review` PUT uses.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/auth';
import { assertUuid, dbError } from '$lib/server/http';
import { countRecentValidations, revertRecentValidations } from '$lib/server/ocrReview';

/** GET ?window=<minutes> — preview how many rows a revert would touch. */
export const GET: RequestHandler = async ({ params, url, locals }) => {
  const { user } = await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');
  const windowMins = parseInt(url.searchParams.get('window') ?? '15');

  const { error: err, count, threshold } = await countRecentValidations(mapId, user.id, windowMins);
  if (err) dbError(err, 'Could not count recent validations');
  return json({ count, threshold });
};

/** POST { windowMins } — actually revert them to pending. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const { user } = await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');
  const body = await request.json().catch(() => ({}));
  const windowMins = body.windowMins ?? 15;

  const { error: err, count } = await revertRecentValidations(mapId, user.id, windowMins);
  if (err) dbError(err, 'Could not revert recent validations');
  return json({ ok: true, count });
};
