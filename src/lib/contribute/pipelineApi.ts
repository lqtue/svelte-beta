/**
 * pipelineApi.ts — the single client for `/api/admin/maps/[id]/pipeline`.
 * Throws `Error(<server message>)` on a non-2xx response.
 */

export type PipelineStage =
  | 'idle'
  | 'ocr_queued'
  | 'ocr_done'
  | 'reviewed'
  | 'seg_queued'
  | 'seg_done'
  | 'seg_reviewed'
  | 'exported';

export type PipelineStatus = {
  map_id: string;
  stage: PipelineStage | string;
  ocr_run_id?: string;
  seg_run_id?: string;
  ocr_started_at?: string;
  ocr_finished_at?: string;
  seg_started_at?: string;
  seg_finished_at?: string;
  reviewed_at?: string;
};

async function request(url: string, init?: RequestInit): Promise<PipelineStatus> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let message = body || res.statusText;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.message) message = String(parsed.message);
    } catch {
      /* not JSON — keep the raw text */
    }
    throw new Error(message);
  }
  return res.json();
}

export function fetchPipelineStatus(mapId: string): Promise<PipelineStatus> {
  return request(`/api/admin/maps/${mapId}/pipeline`);
}

export function advancePipelineStage(mapId: string, stage: string): Promise<PipelineStatus> {
  return request(`/api/admin/maps/${mapId}/pipeline`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  });
}
