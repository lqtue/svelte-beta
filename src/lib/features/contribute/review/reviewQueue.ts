/**
 * reviewQueue.ts — the validating half of /scan?mode=shapes.
 *
 * The machine's shapes waiting on a person: which sheets have any, the ones on
 * the open sheet, and the approve / reject write. Geometry and type edits are
 * held until the verdict — a reviewer nudging a corner has not decided yet —
 * and applied in the same PATCH.
 *
 * Usage:
 *   const queue = createReviewQueue({ supabase });
 *   $queue.footprints   // in markup
 */

import { writable } from 'svelte/store';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/data/supabase/types';
import {
  fetchMapsWithSubmittedFootprints,
  fetchSubmittedFootprints,
  type SamFootprint,
} from '$lib/data/supabase/footprints';
import type { FeatureType } from '$lib/data/maps/footprintTypes';

export type QueueRow = Awaited<ReturnType<typeof fetchMapsWithSubmittedFootprints>>[number];

export type ReviewQueueState = {
  /** Sheets with shapes waiting, newest count first. */
  queue: QueueRow[];
  queueError: string;
  /** The open sheet's waiting shapes. */
  footprints: SamFootprint[];
  selectedId: string | null;
  /** How many were waiting when the sheet opened — the denominator of the progress pill. */
  total: number;
  loading: boolean;
  error: string;
  /** Id currently being written, so its row can say so. */
  deciding: string | null;
};

const EMPTY: ReviewQueueState = {
  queue: [],
  queueError: '',
  footprints: [],
  selectedId: null,
  total: 0,
  loading: false,
  error: '',
  deciding: null,
};

export function createReviewQueue(supabase: SupabaseClient<Database>) {
  const store = writable<ReviewQueueState>({ ...EMPTY });
  const { subscribe, update } = store;

  /** Held until the verdict, then sent with it. */
  let pendingEdits: Record<string, { pixelPolygon?: [number, number][]; featureType?: string }> =
    {};

  async function loadQueue() {
    try {
      const queue = await fetchMapsWithSubmittedFootprints(supabase);
      update((s) => ({ ...s, queue, queueError: '' }));
    } catch (e: any) {
      update((s) => ({ ...s, queueError: e.message }));
    }
  }

  /** Drop the open sheet's rows; the queue itself survives a sheet change. */
  function reset() {
    pendingEdits = {};
    update((s) => ({ ...EMPTY, queue: s.queue, queueError: s.queueError }));
  }

  async function open(mapId: string) {
    reset();
    update((s) => ({ ...s, loading: true }));
    try {
      const footprints = await fetchSubmittedFootprints(supabase, mapId);
      update((s) => ({
        ...s,
        footprints,
        total: footprints.length,
        selectedId: footprints[0]?.id ?? null,
      }));
    } catch (e: any) {
      update((s) => ({ ...s, error: e.message }));
    } finally {
      update((s) => ({ ...s, loading: false }));
    }
  }

  function select(id: string | null) {
    update((s) => ({ ...s, selectedId: id }));
  }

  function edit(id: string, pixelPolygon: [number, number][]) {
    pendingEdits[id] = { ...pendingEdits[id], pixelPolygon };
  }

  function retype(id: string, featureType: string) {
    pendingEdits[id] = { ...pendingEdits[id], featureType };
    // Local too, so the sidebar swatch follows the choice before the verdict.
    update((s) => ({
      ...s,
      footprints: s.footprints.map((f) =>
        f.id === id ? { ...f, featureType: featureType as FeatureType } : f
      ),
    }));
  }

  async function decide(mapId: string, id: string, status: 'submitted' | 'rejected') {
    update((s) => ({ ...s, deciding: id, error: '' }));
    try {
      const edits = pendingEdits[id];
      const body: Record<string, any> = { id, status };
      if (edits?.pixelPolygon) body.pixel_polygon = edits.pixelPolygon;
      if (edits?.featureType) body.feature_type = edits.featureType;

      const res = await fetch('/api/admin/footprints', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { message } = await res.json().catch(() => ({ message: res.statusText }));
        update((s) => ({
          ...s,
          error: `Could not ${status === 'rejected' ? 'reject' : 'approve'}: ${message}`,
        }));
        return;
      }
      delete pendingEdits[id];
      update((s) => {
        const idx = s.footprints.findIndex((f) => f.id === id);
        const footprints = s.footprints.filter((f) => f.id !== id);
        return {
          ...s,
          footprints,
          selectedId: footprints[idx]?.id ?? footprints[idx - 1]?.id ?? null,
          // Keep the rail's count honest without re-querying the whole queue.
          queue: s.queue.map((m) =>
            m.id === mapId ? { ...m, pendingCount: Math.max(0, m.pendingCount - 1) } : m
          ),
        };
      });
    } finally {
      update((s) => ({ ...s, deciding: null }));
    }
  }

  return { subscribe, loadQueue, reset, open, select, edit, retype, decide };
}
