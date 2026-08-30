/**
 * ocrRunApi.ts — the client for `/api/admin/maps/[id]/ocr` (batch OCR runs).
 * Sibling of `$lib/contribute/ocr/ocrApi.ts`, which owns the review endpoint.
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
 * Starts a batch. On Cloudflare there is no `child_process`, so the server
 * answers with the command to run by hand — that comes back as `cliCommand`
 * rather than an error.
 */
export async function startOcrBatch(
  mapId: string,
  body: OcrBatchInput
): Promise<{ cliCommand: string | null }> {
  const res = await fetch(`/api/admin/maps/${mapId}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.cli_only) return { cliCommand: data.cli_command };
  if (!res.ok) throw new Error(data.message ?? res.statusText);
  return { cliCommand: null };
}
