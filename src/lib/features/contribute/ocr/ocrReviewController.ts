/**
 * ocrReviewController.ts — the OCR-review half of /scan?mode=text.
 *
 * Holds the canvas-side state (rows, selection, filter set, draw/isolation
 * toggles, last error) and every write that goes with it, so the route file is
 * left with layout. The sidebar still owns the table and its own loads; the
 * controller reaches back into it through the `reload` / `focusRow` hooks.
 *
 * Usage:
 *   const review = createOcrReview({ … });
 *   $review.extractions   // in markup
 *   on:select={review.select}
 */

import { get, writable } from 'svelte/store';
import { foldAngle, obbFromRow, obbToRow, type ObbRow } from '$lib/core/geo/rectUtils';
import { createManualBbox, patchExtraction, type OcrStatus } from '../shared/ocrApi';
import type { OcrExtraction } from '../shared/types';

export type OcrReviewState = {
  extractions: OcrExtraction[];
  visibleIds: Set<string>;
  selectedId: string | null;
  drawMode: boolean;
  isolationMode: boolean;
  saving: boolean;
  error: string;
};

export type OcrReviewHooks = {
  /** Current map, or null when none is selected. Every write is a no-op without it. */
  getMapId: () => string | null;
  /** Run id a new manual bbox should join (the sidebar's current run). */
  getRunId: () => string;
  /** Ask the sidebar to reload its table after a write. */
  reload: () => void;
  /** Ask the sidebar to scroll to a row; `focusInput` false leaves the keyboard alone. */
  focusRow: (id: string, focusInput?: boolean) => void;
  /** Zoom the canvas to an image-space rect. */
  fitTo: (x: number, y: number, w: number, h: number) => void;
  /** Bring an image-space rect into view without changing the zoom. */
  panTo: (x: number, y: number, w: number, h: number) => void;
  /** Write one row's status through the sidebar, so its table stays the one copy. */
  setRowStatus: (id: string, status: OcrStatus) => void | Promise<void>;
};

const EMPTY: OcrReviewState = {
  extractions: [],
  visibleIds: new Set(),
  selectedId: null,
  drawMode: false,
  isolationMode: false,
  saving: false,
  error: '',
};

export function createOcrReview(hooks: OcrReviewHooks) {
  const store = writable<OcrReviewState>({ ...EMPTY });
  const { subscribe, update } = store;

  /** Drops rows + selection but keeps the view toggles — used when the map changes. */
  function reset() {
    update((s) => ({
      ...EMPTY,
      drawMode: s.drawMode,
      isolationMode: s.isolationMode,
      visibleIds: new Set(),
    }));
  }

  /** A reload keeps the selection when the row survived it — validating a bbox
   *  used to close the panel, which cost a click per label. */
  function loaded(e: CustomEvent<{ extractions: OcrExtraction[] }>) {
    update((s) => ({
      ...s,
      extractions: e.detail.extractions,
      selectedId: e.detail.extractions.some((ex) => ex.id === s.selectedId) ? s.selectedId : null,
    }));
  }

  /**
   * Canvas or row click. It deliberately does NOT focus the row's text input:
   * that put the keyboard in a text field, so every shortcut (r, v, x, j, k)
   * typed a character instead of firing. `e` is how you get to the text.
   */
  function select(e: CustomEvent<{ id: string }>) {
    update((s) => ({ ...s, selectedId: e.detail.id }));
    reveal(e.detail.id);
    hooks.focusRow(e.detail.id, false);
  }

  /** Pans the canvas only when the bbox is off screen, so a click never jumps. */
  function reveal(id: string) {
    const ext = get(store).extractions.find((ex) => ex.id === id);
    if (ext) hooks.panTo(ext.global_x, ext.global_y, ext.global_w, ext.global_h);
  }

  /**
   * Moves the selection through the rows the sidebar shows, in its sort order —
   * `visibleIds` is built from that list and a Set keeps insertion order. Wraps
   * at both ends; with nothing selected, forward starts at the top and back at
   * the bottom. Leaves the keyboard on the canvas.
   */
  function step(delta: number) {
    const s = get(store);
    const ids = s.visibleIds.size ? [...s.visibleIds] : s.extractions.map((ex) => ex.id);
    if (!ids.length) return;
    const at = s.selectedId ? ids.indexOf(s.selectedId) : -1;
    const to = at < 0 ? (delta > 0 ? 0 : ids.length - 1) : (at + delta + ids.length) % ids.length;
    const id = ids[to];
    update((st) => ({ ...st, selectedId: id }));
    reveal(id);
    hooks.focusRow(id, false);
  }

  /**
   * Keyboard validate / reject. Pressing the same one twice returns the row to
   * pending, like the panel's buttons. The write goes through the sidebar so its
   * table, counts and error line stay the single copy.
   * ponytail: the canvas copy is optimistic and never reverted — a failed write
   * shows in the sidebar's error line. Revert here if that proves confusing.
   */
  function setStatus(status: OcrStatus, advance = false) {
    const s = get(store);
    const id = s.selectedId;
    const ext = id ? s.extractions.find((ex) => ex.id === id) : null;
    if (!id || !ext) return;
    const next: OcrStatus = ext.status === status ? 'pending' : status;
    update((st) => ({
      ...st,
      extractions: st.extractions.map((ex) => (ex.id === id ? { ...ex, status: next } : ex)),
    }));
    void hooks.setRowStatus(id, next);
    if (advance) step(1);
  }

  function filter(e: CustomEvent<{ extractions: OcrExtraction[] }>) {
    const ids = new Set(e.detail.extractions.map((ex) => ex.id));
    update((s) => ({ ...s, visibleIds: ids }));
  }

  function zoom(
    e: CustomEvent<{ globalX: number; globalY: number; globalW: number; globalH: number }>
  ) {
    const { globalX, globalY, globalW, globalH } = e.detail;
    hooks.fitTo(globalX, globalY, globalW, globalH);
  }

  /**
   * Every geometry edit — move, resize, turn — arrives here as the label's own
   * rectangle plus the axis-aligned box around it (see `obbToRow`). Optimistic:
   * the canvas has already drawn it by the time this fires.
   */
  async function edit(e: CustomEvent<{ id: string } & Required<ObbRow>>) {
    const mapId = hooks.getMapId();
    if (!mapId) return;
    const { id, ...cols } = e.detail;
    update((s) => ({
      ...s,
      extractions: s.extractions.map((ex) => (ex.id === id ? { ...ex, ...cols } : ex)),
    }));
    try {
      await patchExtraction(mapId, { id, ...cols });
    } catch (err: any) {
      update((s) => ({ ...s, error: err.message }));
    }
  }

  /**
   * Angle-only edit for the keyboard and the panel's reset. Nothing but `deg`
   * changes, so the label keeps its size and the box is rebuilt around it.
   * ponytail: one PATCH per keypress. Debounce if holding a key ever matters.
   */
  function turnSelected(deg: number) {
    const ext = selected();
    if (!ext) return;
    const obb = obbFromRow(ext);
    void edit(
      new CustomEvent('edit', {
        detail: { id: ext.id, ...obbToRow({ ...obb, deg: foldAngle(deg) }) },
      })
    );
  }

  /** Keyboard fine-tune of the selected label's angle, in degrees. */
  function nudgeRotation(delta: number) {
    const ext = selected();
    if (ext) turnSelected(obbFromRow(ext).deg + delta);
  }

  function selected(): OcrExtraction | null {
    const s = get(store);
    return (s.selectedId && s.extractions.find((ex) => ex.id === s.selectedId)) || null;
  }

  async function draw(e: CustomEvent<Required<ObbRow>>) {
    const mapId = hooks.getMapId();
    if (!mapId) return;
    update((s) => ({ ...s, drawMode: false }));
    const cols = e.detail;
    let id: string;
    try {
      id = await createManualBbox(mapId, { run_id: hooks.getRunId(), ...cols });
    } catch (err: any) {
      update((s) => ({ ...s, error: err.message }));
      return;
    }
    // Mirror the server defaults for a manual row (see the ocr-review POST).
    const row: OcrExtraction = {
      id,
      tile_x: Math.round(cols.global_x),
      tile_y: Math.round(cols.global_y),
      tile_w: 0,
      tile_h: 0,
      ...cols,
      category: 'other',
      text: '',
      text_validated: null,
      category_validated: null,
      confidence: 1.0,
      status: 'pending',
    };
    update((s) => ({ ...s, extractions: [...s.extractions, row], selectedId: id }));
  }

  /** Writes the bbox panel's buffer back, then refreshes the sidebar. */
  async function save(e: CustomEvent<{ status: OcrStatus; text: string; category: string }>) {
    const mapId = hooks.getMapId();
    const selectedId = get(store).selectedId;
    if (!mapId || !selectedId) return;
    update((s) => ({ ...s, saving: true }));
    const { status, text, category } = e.detail;
    try {
      await patchExtraction(mapId, { id: selectedId, text, category, status });
      update((s) => ({
        ...s,
        extractions: s.extractions.map((ex) =>
          ex.id === selectedId
            ? { ...ex, text_validated: text, category_validated: category, status }
            : ex
        ),
      }));
      hooks.reload();
    } catch (err: any) {
      update((s) => ({ ...s, error: err.message }));
    } finally {
      update((s) => ({ ...s, saving: false }));
    }
  }

  function deselect() {
    update((s) => ({ ...s, selectedId: null }));
  }

  /** Turning draw mode on clears the selection so the panel gets out of the way. */
  function toggleDraw() {
    update((s) => {
      const drawMode = !s.drawMode;
      return { ...s, drawMode, selectedId: drawMode ? null : s.selectedId };
    });
  }

  function cancelDraw() {
    update((s) => (s.drawMode ? { ...s, drawMode: false } : s));
  }

  function toggleIsolation() {
    update((s) => ({ ...s, isolationMode: !s.isolationMode }));
  }

  return {
    subscribe,
    reset,
    loaded,
    select,
    step,
    setStatus,
    filter,
    zoom,
    edit,
    nudgeRotation,
    turnSelected,
    draw,
    save,
    deselect,
    toggleDraw,
    cancelDraw,
    toggleIsolation,
  };
}

export type OcrReviewController = ReturnType<typeof createOcrReview>;
