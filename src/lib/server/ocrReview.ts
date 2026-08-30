/**
 * Shared write paths for OCR review.
 *
 * `PUT /api/admin/maps/[id]/ocr-review` (bulk status) and
 * `…/ocr-review/revert-recent` (undo the last N minutes of validations) both
 * stamp `validated_at` / `validated_by` the same way; that stamping used to be
 * written out three times.
 */

import { adminClient } from './supabaseAdmin';

export const OCR_REVIEW_STATUSES = ['validated', 'rejected', 'pending'] as const;
export type OcrReviewStatus = (typeof OCR_REVIEW_STATUSES)[number];

export function isOcrReviewStatus(v: unknown): v is OcrReviewStatus {
  return OCR_REVIEW_STATUSES.includes(v as OcrReviewStatus);
}

/**
 * `validated_at` / `validated_by` for a status transition. Validating records
 * who signed off; rejecting or reverting to pending clears the stamp.
 */
export function validationStamp(status: string, userId: string) {
  return status === 'validated'
    ? { validated_at: new Date().toISOString(), validated_by: userId }
    : { validated_at: null, validated_by: null };
}

/** ISO timestamp `windowMins` ago — the cut-off for "recently validated". */
export function revertThreshold(windowMins: number): string {
  return new Date(Date.now() - windowMins * 60 * 1000).toISOString();
}

/**
 * Bulk status change for a map's extractions, scoped either to explicit `ids`
 * or to a whole `runId`. The caller is responsible for requiring one of them.
 */
export async function bulkSetStatus(opts: {
  mapId: string;
  status: OcrReviewStatus;
  userId: string;
  ids?: string[] | null;
  runId?: string | null;
}) {
  let q = adminClient()
    .from('ocr_extractions')
    .update({ status: opts.status, ...validationStamp(opts.status, opts.userId) })
    .eq('map_id', opts.mapId);

  if (opts.ids?.length) q = q.in('id', opts.ids);
  else if (opts.runId) q = q.eq('run_id', opts.runId);

  return await q;
}

/** Rows this user validated on this map inside the window. */
function recentQuery(mapId: string, userId: string, threshold: string) {
  return adminClient()
    .from('ocr_extractions')
    .select('id', { count: 'exact' })
    .eq('map_id', mapId)
    .eq('status', 'validated')
    .eq('validated_by', userId)
    .gt('validated_at', threshold);
}

/** How many of this user's validations on this map fall inside the window. */
export async function countRecentValidations(mapId: string, userId: string, windowMins: number) {
  const threshold = revertThreshold(windowMins);
  const { error, count } = await recentQuery(mapId, userId, threshold);
  return { error, count: count ?? 0, threshold };
}

/** Revert this user's validations on this map inside the window back to pending. */
export async function revertRecentValidations(mapId: string, userId: string, windowMins: number) {
  const threshold = revertThreshold(windowMins);
  const { error, count } = await adminClient()
    .from('ocr_extractions')
    .update({ status: 'pending', ...validationStamp('pending', userId) })
    .eq('map_id', mapId)
    .eq('status', 'validated')
    .eq('validated_by', userId)
    .gt('validated_at', threshold);

  return { error, count, threshold };
}
