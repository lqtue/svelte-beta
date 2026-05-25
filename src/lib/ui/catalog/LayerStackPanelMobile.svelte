<!--
  LayerStackPanelMobile.svelte — mobile-only layer stack.

  Differences from desktop LayerStackPanel:
    • The whole row is the opacity slider — horizontal drag sets opacity.
    • Reorder is via ▲ / ▼ buttons (no HTML5 drag, which barely works on touch).
    • Only a remove (×) action — no hide/show toggle.
    • Display + Base pickers live in a separate "Controls" drawer, not here.
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
  // Track press start; only switch to "dragging" after the pointer moves
  // past a threshold, so a clean tap can still fire zoom-to-overlay.
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
    // Ignore presses on action buttons (reorder arrows, remove).
    if ((e.target as HTMLElement).closest('.lspm-action')) return;
    const row = e.currentTarget as HTMLElement;
    pressId = id;
    pressStartX = e.clientX;
    dragging = false;
    try { row.setPointerCapture(e.pointerId); } catch {}
  }

  function onRowPointerMove(id: string, e: PointerEvent) {
    if (pressId !== id) return;
    if (!dragging && Math.abs(e.clientX - pressStartX) >= DRAG_THRESHOLD_PX) {
      dragging = true;
    }
    if (dragging) setOpacityFromPointer(e.currentTarget as HTMLElement, id, e);
  }

  function onRowPointerUp(id: string, e: PointerEvent) {
    if (pressId !== id) return;
    const row = e.currentTarget as HTMLElement;
    try { row.releasePointerCapture(e.pointerId); } catch {}
    if (!dragging) {
      // Clean tap → zoom to overlay bounds.
      const ov = state.overlays.find(o => o.id === id);
      if (ov) dispatch('zoomToOverlay', { mapId: ov.ref.mapId });
    }
    pressId = null;
    dragging = false;
  }

  function moveUp(i: number) {
    if (i > 0) layersStore.reorderOverlay(i, i - 1);
  }
  function moveDown(i: number) {
    if (i < state.overlays.length - 1) layersStore.reorderOverlay(i, i + 1);
  }
</script>

<div class="lspm">
  <div class="lspm-heading">
    My layers
    {#if state.overlays.length > 0}
      <span class="lspm-sub">Drag row for opacity · tap to zoom</span>
    {/if}
  </div>

  {#if state.overlays.length === 0}
    <div class="lspm-empty">Open <strong>Browse</strong> and tap <strong>+</strong> to add a layer.</div>
  {:else}
    <ul class="lspm-list">
      {#each state.overlays as o, i (o.id)}
        <li
          class="lspm-row"
          class:top={i === 0}
          class:dragging={pressId === o.id && dragging}
          style="--fill: {Math.round(o.opacity * 100)}%"
          on:pointerdown={(e) => onRowPointerDown(o.id, e)}
          on:pointermove={(e) => onRowPointerMove(o.id, e)}
          on:pointerup={(e) => onRowPointerUp(o.id, e)}
          on:pointercancel={(e) => onRowPointerUp(o.id, e)}
        >
          <div class="lspm-reorder">
            <button
              type="button"
              class="lspm-action lspm-arrow"
              on:click={() => moveUp(i)}
              disabled={i === 0}
              aria-label="Move layer up"
              title="Move up"
            >▲</button>
            <button
              type="button"
              class="lspm-action lspm-arrow"
              on:click={() => moveDown(i)}
              disabled={i === state.overlays.length - 1}
              aria-label="Move layer down"
              title="Move down"
            >▼</button>
          </div>

          <div class="lspm-body">
            <div class="lspm-name" title={o.ref.name ?? ''}>
              {#if isSideBySide && (i === 0 || i === 1)}
                <span class="lspm-pane" class:left={i === 0} class:right={i === 1}
                  >{i === 0 ? 'L' : 'R'}</span>
              {/if}
              {#if yearByMapId.get(o.ref.mapId) != null}
                <span class="lspm-year">{yearByMapId.get(o.ref.mapId)}</span>
              {/if}
              <span class="lspm-text">{o.ref.name ?? o.ref.mapId.slice(0, 8)}</span>
            </div>
          </div>

          <div class="lspm-pct">{Math.round(o.opacity * 100)}%</div>

          <button
            type="button"
            class="lspm-action lspm-x"
            on:click={() => layersStore.removeOverlay(o.id)}
            aria-label="Remove layer"
            title="Remove"
          >×</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .lspm {
    display: flex; flex-direction: column;
    height: 100%;
    margin: 0.5rem 0.6rem;
    padding: 0.5rem 0.55rem 0.6rem;
    background: #fff;
    border: 1.5px solid #111; border-radius: 10px;
    font-family: 'Outfit', sans-serif;
    overflow-y: auto;
  }
  .lspm-heading {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.72rem; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: #555;
    margin: 0.25rem 0 0.5rem;
    display: flex; align-items: baseline; gap: 0.5rem;
    flex-wrap: wrap;
  }
  .lspm-sub {
    font-family: 'Outfit', sans-serif;
    font-size: 0.66rem; font-weight: 500;
    text-transform: none; letter-spacing: 0;
    color: #888;
  }
  .lspm-empty {
    padding: 1rem;
    font-size: 0.8rem; color: #888;
    background: #fafaf7; border-radius: 6px;
    border: 1px dashed #d9d4c0;
    text-align: center;
  }
  .lspm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }

  /* Row IS the slider track. Background fill = current opacity. */
  .lspm-row {
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
    touch-action: pan-y;     /* allow vertical page scroll, capture horizontal */
    user-select: none;
    cursor: ew-resize;
  }
  .lspm-row.top {
    background:
      linear-gradient(to right,
        rgba(245, 158, 11, 0.30) 0,
        rgba(245, 158, 11, 0.30) var(--fill),
        #fff7d1 var(--fill),
        #fff7d1 100%);
  }
  .lspm-row.dragging { box-shadow: 0 0 0 3px rgba(37,99,235,0.35); }

  .lspm-reorder {
    flex-shrink: 0;
    display: flex; flex-direction: column; gap: 2px;
  }
  .lspm-arrow {
    width: 28px; height: 22px;
    display: flex; align-items: center; justify-content: center;
    background: #fff; border: 1.5px solid #111; border-radius: 4px;
    font: inherit; font-size: 0.7rem; line-height: 1;
    cursor: pointer; color: #111; padding: 0;
  }
  .lspm-arrow:disabled { opacity: 0.3; cursor: default; }
  .lspm-arrow:not(:disabled):active { background: #fff7d1; }

  .lspm-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
  .lspm-name {
    font-size: 0.88rem; font-weight: 700; color: #111;
    display: flex; align-items: center; gap: 0.4rem;
    min-width: 0;
  }
  .lspm-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .lspm-year {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    font-size: 0.82rem; font-weight: 800;
    color: #2563eb;
  }
  .lspm-pane {
    flex-shrink: 0;
    width: 20px; height: 20px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 4px; border: 1.5px solid #111;
    font-size: 0.7rem; font-weight: 800; line-height: 1;
    background: #fff; color: #111;
  }
  .lspm-pane.left  { background: #2563eb; color: #fff; border-color: #2563eb; }
  .lspm-pane.right { background: #f59e0b; color: #fff; border-color: #f59e0b; }

  .lspm-pct {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    font-size: 0.78rem; font-weight: 800;
    color: #111;
    min-width: 38px; text-align: right;
  }

  .lspm-x {
    flex-shrink: 0;
    width: 32px; height: 32px;
    background: #fff; border: 1.5px solid #111; border-radius: 999px;
    font: inherit; font-size: 1.1rem; font-weight: 800; line-height: 1;
    cursor: pointer; padding: 0; color: #666;
  }
  .lspm-x:active { background: #fee2e2; color: #b91c1c; }
</style>
