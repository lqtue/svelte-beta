/**
 * ocrRunApi.ts — the client for `/api/admin/maps/[id]/ocr` (batch OCR runs).
 * Sibling of `$lib/features/contribute/ocr/ocrApi.ts`, which owns the review endpoint.
 */

import type { TileOverrides } from './tileParams';

export type OcrRunSummary = { n: number; categories: Record<string, number> };

export type OcrBatchInput = {
  neatline: [number, number, number, number];
  tile_size: number;
  overlap: number;
  run_id: string;
  min_confidence: number;
  tile_overrides?: TileOverrides;
};

/** Run summaries keyed by run id, or `null` when the lookup failed (caller keeps what it had). */
export async function fetchOcrRuns(mapId: string): Promise<Record<string, OcrRunSummary> | null> {
  try {
    const res = await fetch(`/api/admin/maps/${mapId}/ocr`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.runs ?? {};
  } catch {
    return null;
  }
}

/**
 * Enqueues a batch. Nothing runs until a `vma_worker.py` claims the job, so a
 * 202 here means "queued", not "finished" — extractions appear once the worker
 * has run and the pipeline stage flips to `ocr_done`.
 */
export async function startOcrBatch(
  mapId: string,
  body: OcrBatchInput
): Promise<{ jobId: string; status: string }> {
  const res = await fetch(`/api/admin/maps/${mapId}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? res.statusText);
  return { jobId: data.job_id, status: data.status };
}
