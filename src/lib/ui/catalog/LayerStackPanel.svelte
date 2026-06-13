<!--
  LayerStackPanel.svelte — unified layer stack used by both the desktop sidebar
  and the mobile "Layers" drawer.

  Behavior:
    • Whole row is the opacity slider (pointer drag, 6px threshold so taps
      still register as zoom-to-overlay).
    • Reorder via ▲ / ▼ buttons (works on touch and mouse).
    • Remove (×) only — no hide/show.
    • Display mode + Base picker live in LayerControlsPanel, not here.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { layersStore } from '$lib/stores/layersStore';
  import type { ViewMode, MapListItem } from '$lib/map/types';

  export let viewMode: ViewMode = 'overlay';
  /** Catalog list used to enrich rows with year. */
  export let mapList: MapListItem[] = [];

  const dispatch = createEventDispatcher<{ zoomToOverlay: { mapId: string } }>();

  $: state = $layersStore;
  $: isSideBySide = viewMode === 'dual';

  $: yearByMapId = (() => {
    const m = new Map<string, number | string>();
    for (const item of mapList) if (item?.id && item.year != null) m.set(item.id, item.year as any);
    return m;
  })();

  // ── Per-row drag-to-opacity ──────────────────────────────────────
  const DRAG_THRESHOLD_PX = 6;
  let pressId: string | null = null;
  let pressStartX = 0;
  let dragging = false;

  function setOpacityFromPointer(rowEl: HTMLElement, id: string, e: PointerEvent) {
    const rect = rowEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const snapped = Math.round(pct * 20) / 20;     // 5% steps
    layersStore.setOpacity(id, snapped);
  }

  function onRowPointerDown(id: string, e: PointerEvent) {
    if ((e.target as HTMLElement).closest('.lsp-action')) return;
    const row = e.currentTarget as HTMLElement;
    pressId = id;
    pressStartX = e.clientX;
    dragging = false;
    try { row.setPointerCapture(e.pointerId); } catch {}
  }
  function onRowPointerMove(id: string, e: PointerEvent) {
    if (pressId !== id) return;
    if (!dragging && Math.abs(e.clientX - pressStartX) >= DRAG_THRESHOLD_PX) dragging = true;
    if (dragging) setOpacityFromPointer(e.currentTarget as HTMLElement, id, e);
  }
  function onRowPointerUp(id: string, e: PointerEvent) {
    if (pressId !== id) return;
    const row = e.currentTarget as HTMLElement;
    try { row.releasePointerCapture(e.pointerId); } catch {}
    if (!dragging) {
      const ov = state.overlays.find(o => o.id === id);
      if (ov) dispatch('zoomToOverlay', { mapId: ov.ref.mapId });
    }
    pressId = null;
    dragging = false;
  }

  function moveUp(i: number)   { if (i > 0) layersStore.reorderOverlay(i, i - 1); }
  function moveDown(i: number) { if (i < state.overlays.length - 1) layersStore.reorderOverlay(i, i + 1); }
</script>

<div class="lsp">
  {#if state.overlays.length > 0}
    <div class="lsp-sub">Drag a row for opacity · tap to zoom</div>
  {/if}

  {#if state.overlays.length === 0}
    <div class="lsp-empty">Nothing stacked yet. Open <strong>Browse</strong> and tap <strong>+</strong> on a map to add it.</div>
  {:else}
    <ul class="lsp-list">
      {#each state.overlays as o, i (o.id)}
        <li
          class="lsp-row"
          class:dragging={pressId === o.id && dragging}
          style="--fill: {Math.round(o.opacity * 100)}%"
          on:pointerdown={(e) => onRowPointerDown(o.id, e)}
          on:pointermove={(e) => onRowPointerMove(o.id, e)}
          on:pointerup={(e) => onRowPointerUp(o.id, e)}
          on:pointercancel={(e) => onRowPointerUp(o.id, e)}
        >
          <div class="lsp-reorder">
            <button type="button" class="lsp-action lsp-arrow" on:click={() => moveUp(i)}
              disabled={i === 0} aria-label="Move layer up" title="Move up">▲</button>
            <button type="button" class="lsp-action lsp-arrow" on:click={() => moveDown(i)}
              disabled={i === state.overlays.length - 1} aria-label="Move layer down" title="Move down">▼</button>
          </div>

          <div class="lsp-body">
            <div class="lsp-name" title={o.ref.name ?? ''}>
              {#if isSideBySide && (i === 0 || i === 1)}
                <span class="lsp-pane" class:left={i === 0} class:right={i === 1}
                  >{i === 0 ? 'Top' : 'Bottom'}</span>
              {/if}
              {#if yearByMapId.get(o.ref.mapId) != null}
                <span class="lsp-year">{yearByMapId.get(o.ref.mapId)}</span>
              {/if}
              <span class="lsp-text">{o.ref.name ?? o.ref.mapId.slice(0, 8)}</span>
            </div>
          </div>

          <div class="lsp-pct">{Math.round(o.opacity * 100)}%</div>

          <button type="button" class="lsp-action lsp-x"
            on:click={() => layersStore.removeOverlay(o.id)}
            aria-label="Remove layer" title="Remove">×</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .lsp {
    display: flex; flex-direction: column;
    padding: 0.5rem 0.6rem 0.6rem;
    font-family: 'Outfit', sans-serif;
  }
  .lsp-sub {
    font-size: 0.66rem; font-weight: 500;
    color: #888;
    margin: 0 0 0.4rem;
  }
  .lsp-empty {
    padding: 1rem;
    font-size: 0.8rem; color: #888;
    background: #fafaf7; border-radius: 6px;
    border: 1px dashed #d9d4c0;
    text-align: center;
  }
  .lsp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }

  .lsp-row {
    position: relative;
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.55rem 0.55rem;
    min-height: 52px;
    background:
      linear-gradient(to right,
        rgba(37, 99, 235, 0.18) 0,
        rgba(37, 99, 235, 0.18) var(--fill),
        #fafaf7 var(--fill),
        #fafaf7 100%);
    border: 1.5px solid #111; border-radius: 8px;
    touch-action: pan-y;
    user-select: none;
    cursor: ew-resize;
  }
  .lsp-row.dragging { box-shadow: 0 0 0 3px rgba(37,99,235,0.35); }

  .lsp-reorder {
    flex-shrink: 0;
    display: flex; flex-direction: column; gap: 2px;
  }
  .lsp-arrow {
    width: 28px; height: 22px;
    display: flex; align-items: center; justify-content: center;
    background: #fff; border: 1.5px solid #111; border-radius: 4px;
    font: inherit; font-size: 0.7rem; line-height: 1;
    cursor: pointer; color: #111; padding: 0;
  }
  .lsp-arrow:disabled { opacity: 0.3; cursor: default; }
  .lsp-arrow:not(:disabled):active { background: #fff7d1; }

  .lsp-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
  .lsp-name {
    font-size: 0.88rem; font-weight: 700; color: #111;
    display: flex; align-items: center; gap: 0.4rem;
    min-width: 0;
  }
  .lsp-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .lsp-year {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    font-size: 0.82rem; font-weight: 800;
    color: #2563eb;
  }
  .lsp-pane {
    flex-shrink: 0;
    padding: 0.1rem 0.45rem;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 999px; border: 1.5px solid #111;
    font-size: 0.66rem; font-weight: 800; line-height: 1.2;
    text-transform: uppercase; letter-spacing: 0.03em;
    background: #fff; color: #111;
  }
  .lsp-pane.left  { background: #2563eb; color: #fff; border-color: #2563eb; }
  .lsp-pane.right { background: #f59e0b; color: #fff; border-color: #f59e0b; }

  .lsp-pct {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    font-size: 0.78rem; font-weight: 800;
    color: #111;
    min-width: 38px; text-align: right;
  }

  .lsp-x {
    flex-shrink: 0;
    width: 32px; height: 32px;
    background: #fff; border: 1.5px solid #111; border-radius: 999px;
    font: inherit; font-size: 1.1rem; font-weight: 800; line-height: 1;
    cursor: pointer; padding: 0; color: #666;
  }
  .lsp-x:active { background: #fee2e2; color: #b91c1c; }
</style>
