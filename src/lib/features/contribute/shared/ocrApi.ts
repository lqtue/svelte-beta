/**
 * ocrApi.ts — the single client for `/api/admin/maps/[id]/ocr-review`.
 *
 * Every call throws `Error(<server message>)` on a non-2xx response; callers
 * decide how to surface it. No caller should hand-roll these fetches.
 */

import type { EditableOcrExtraction, OcrExtraction } from './types';

export type OcrStatus = 'pending' | 'validated' | 'rejected';

export type OcrReviewPage = {
  extractions: OcrExtraction[];
  total: number;
  statusCounts: Record<string, number>;
  runIds: string[];
};

/** Fields the PATCH handler accepts alongside the required `id`. */
export type OcrExtractionPatch = {
  id: string;
  text?: string;
  category?: string;
  notes?: string;
  status?: OcrStatus;
  global_x?: number;
  global_y?: number;
  global_w?: number;
  global_h?: number;
};

export type ManualBboxInput = {
  run_id: string;
  global_x: number;
  global_y: number;
  global_w: number;
  global_h: number;
  category?: string;
  text?: string;
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Reads the server's error text, preferring SvelteKit's `{ message }` body. */
async function errorMessage(res: Response): Promise<string> {
  const body = await res.text().catch(() => '');
  try {
    const parsed = JSON.parse(body);
    if (parsed?.message) return String(parsed.message);
  } catch {
    /* not JSON — fall through to the raw text */
  }
  return body || res.statusText;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as T;
}

const base = (mapId: string) => `/api/admin/maps/${mapId}/ocr-review`;

export async function fetchExtractions(
  mapId: string,
  params: { status?: string; runId?: string; limit?: number; offset?: number } = {}
): Promise<OcrReviewPage> {
  const qs = new URLSearchParams({ limit: String(params.limit ?? 200) });
  if (params.status) qs.set('status', params.status);
  if (params.runId?.trim()) qs.set('run_id', params.runId.trim());
  if (params.offset) qs.set('offset', String(params.offset));
  const page = await request<OcrReviewPage>(`${base(mapId)}?${qs}`);
  return {
    extractions: page.extractions ?? [],
    total: page.total ?? 0,
    statusCounts: page.statusCounts ?? {},
    runIds: page.runIds ?? [],
  };
}

export async function patchExtraction(mapId: string, body: OcrExtractionPatch): Promise<void> {
  await request(base(mapId), {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** Bulk status update. Returns the number of rows the server reports changed. */
export async function batchSetStatus(
  mapId: string,
  ids: string[],
  status: OcrStatus
): Promise<number> {
  const data = await request<{ count?: number }>(base(mapId), {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ ids, status }),
  });
  return data.count ?? ids.length;
}

/** Reverts rows this user validated in the last `minutes`. Returns the count. */
export async function revertRecent(mapId: string, minutes: number): Promise<number> {
  const data = await request<{ count?: number }>(`${base(mapId)}/revert-recent`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ windowMins: minutes }),
  });
  return data.count ?? 0;
}

/** Creates a hand-drawn bbox (model: 'manual'). Returns the new row's id. */
export async function createManualBbox(mapId: string, body: ManualBboxInput): Promise<string> {
  const data = await request<{ id: string }>(base(mapId), {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  return data.id;
}

/** Seeds the client-side edit buffer used by the review tables. */
export function withEditState(rows: OcrExtraction[]): EditableOcrExtraction[] {
  return rows.map((e) => ({
    ...e,
    _editText: e.text_validated ?? e.text,
    _editCategory: e.category_validated ?? e.category,
    _saving: false,
  }));
}
