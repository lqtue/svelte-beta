<!--
  LayerStackPanel.svelte — sidebar UI showing the current layer stack.
  Top of list = top of stack. Each overlay has opacity slider + remove + visibility.
  Base at the bottom shows current base (modern key or historical map name) with a "Reset" affordance.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { layersStore } from '$lib/stores/layersStore';
  import type { ViewMode } from '$lib/map/types';

  /** Current display mode ('overlay' | 'spy' | 'dual'). Passed in by the page. */
  export let viewMode: ViewMode = 'overlay';

  $: isSideBySide = viewMode === 'dual';

  const dispatch = createEventDispatcher<{ changeViewMode: { mode: ViewMode } }>();
  const DISPLAY_MODES: { mode: ViewMode; label: string; icon: string }[] = [
    { mode: 'overlay', label: 'Stacked',      icon: '≡' },
    { mode: 'spy',     label: 'Lens',         icon: '◎' },
    { mode: 'dual',    label: 'Side-by-side', icon: '⊟' },
  ];

  const BASE_CHOICES: { key: string; label: string }[] = [
    { key: 'g-streets',   label: '🗺️ Maps' },
    { key: 'g-satellite', label: '🛰️ Satellite' },
    { key: 'none',        label: '⊘ None' },
  ];

  $: state = $layersStore;
  $: currentBaseKey = state.base.kind === 'basemap' ? state.base.key : 'g-streets';

  function setBase(key: string) {
    layersStore.setBase({ kind: 'basemap', key });
  }

  function onOpacityInput(id: string, e: Event) {
    const v = parseFloat((e.target as HTMLInputElement).value);
    layersStore.setOpacity(id, v);
  }

  // ── Drag to reorder ──────────────────────────────────────────────
  let dragFrom: number | null = null;
  let dragOver: number | null = null;

  function onDragStart(i: number, e: DragEvent) {
    dragFrom = i;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      // Some browsers require data to be set for drag to fire.
      e.dataTransfer.setData('text/plain', String(i));
    }
  }
  function onDragOver(i: number, e: DragEvent) {
    if (dragFrom === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dragOver = i;
  }
  function onDrop(i: number, e: DragEvent) {
    e.preventDefault();
    if (dragFrom !== null && dragFrom !== i) layersStore.reorderOverlay(dragFrom, i);
    dragFrom = null;
    dragOver = null;
  }
  function onDragEnd() { dragFrom = null; dragOver = null; }
</script>

<div class="lsp">
  <div class="lsp-display">
    {#each DISPLAY_MODES as m}
      <button
        type="button"
        class="lsp-display-pill"
        class:on={viewMode === m.mode}
        on:click={() => dispatch('changeViewMode', { mode: m.mode })}
        title={m.label}
      >
        <span class="lsp-display-icon" aria-hidden="true">{m.icon}</span>
        <span class="lsp-display-name">{m.label}</span>
      </button>
    {/each}
  </div>

  <div class="lsp-heading">My layers</div>

  <div class="lsp-slot">
    {#if state.overlays.length === 0}
      <div class="lsp-empty">Click <strong>+</strong> to add a layer and drag to organize.</div>
    {:else}
      <ul class="lsp-list">
    {#each state.overlays as o, i (o.id)}
      <li
        class="lsp-row"
        class:top={i === 0}
        class:dragging={dragFrom === i}
        class:drag-over={dragOver === i && dragFrom !== null && dragFrom !== i}
        on:dragover={(e) => onDragOver(i, e)}
        on:drop={(e) => onDrop(i, e)}
      >
        <span
          class="lsp-grip"
          draggable="true"
          on:dragstart={(e) => onDragStart(i, e)}
          on:dragend={onDragEnd}
          aria-hidden="true"
          title="Drag to reorder"
        >⋮⋮</span>
        <button
          type="button"
          class="lsp-vis"
          on:click={() => layersStore.setVisible(o.id, !o.visible)}
          title={o.visible ? 'Hide' : 'Show'}
          aria-label={o.visible ? 'Hide layer' : 'Show layer'}
        >{o.visible ? '👁' : '🚫'}</button>

        <div class="lsp-body">
          <div class="lsp-name" title={o.ref.name ?? ''}>
            {#if isSideBySide && (i === 0 || i === 1)}
              <span
                class="lsp-pane"
                class:left={i === 0}
                class:right={i === 1}
                title="Drag rows to swap left/right"
                aria-label={i === 0 ? 'Left pane' : 'Right pane'}
              >{i === 0 ? 'L' : 'R'}</span>
            {/if}
            {o.ref.name ?? o.ref.mapId.slice(0, 8)}
          </div>
          <input
            type="range" min="0" max="1" step="0.05"
            value={o.opacity}
            on:input={(e) => onOpacityInput(o.id, e)}
            class="lsp-slider"
            disabled={!o.visible}
          />
        </div>

        <button class="lsp-x" on:click={() => layersStore.removeOverlay(o.id)} title="Remove" aria-label="Remove layer">×</button>
      </li>
    {/each}
      </ul>
    {/if}
  </div>

  <div class="lsp-base">
    <span class="lsp-base-label">Base</span>
    <div class="lsp-base-pills">
      {#each BASE_CHOICES as c}
        <button
          type="button"
          class="lsp-base-pill"
          class:on={currentBaseKey === c.key}
          on:click={() => setBase(c.key)}
        >{c.label}</button>
      {/each}
    </div>
  </div>
</div>

<style>
  .lsp {
    display: flex; flex-direction: column;
    height: 100%;
    margin: 0.6rem 0.6rem 0;
    padding: 0.55rem 0.65rem 0.6rem;
    background: #fff;
    border: 1.5px solid #111; border-radius: 10px;
    font-family: 'Outfit', sans-serif;
    overflow: hidden;
  }
  .lsp-heading {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.7rem; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: #555; margin: 0.5rem 0 0.4rem;
  }

  /* Display mode (Stacked / Lens / Side-by-side) */
  .lsp-display {
    flex-shrink: 0;
    display: flex; gap: 0.25rem;
  }
  .lsp-display-pill {
    flex: 1;
    display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem;
    padding: 0.3rem 0.4rem;
    background: #fff; color: #111;
    border: 1.5px solid #111; border-radius: 999px;
    font: inherit; font-family: 'Outfit', sans-serif;
    font-size: 0.72rem; font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .lsp-display-pill:hover { background: #fafaf7; }
  .lsp-display-pill.on { background: #111; color: #fff; border-color: #111; }
  .lsp-display-icon { font-size: 0.85rem; line-height: 1; }
  @media (max-width: 360px) { .lsp-display-name { display: none; } }
  /* Layer list slot fills the panel and scrolls internally. */
  .lsp-slot {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  .lsp-slot::-webkit-scrollbar { width: 4px; }
  .lsp-slot::-webkit-scrollbar-thumb { background: #c8c4b5; border-radius: 999px; }
  .lsp-empty {
    height: 100%;
    display: flex; align-items: center; justify-content: center;
    padding: 0.5rem;
    font-size: 0.75rem; color: #888;
    background: #fafaf7; border-radius: 6px;
    border: 1px dashed #d9d4c0;
    text-align: center;
  }
  .lsp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
  .lsp-row {
    display: flex; align-items: center; gap: 0.45rem;
    padding: 0.35rem 0.4rem;
    background: #fafaf7;
    border: 1.5px solid #111; border-radius: 6px;
  }
  .lsp-row.top { background: #fff7d1; }
  .lsp-row.dragging { opacity: 0.4; }
  .lsp-row.drag-over { box-shadow: 0 -3px 0 #2563eb inset; }
  .lsp-grip {
    flex-shrink: 0;
    color: #aaa; font-size: 0.85rem; line-height: 1;
    cursor: grab; user-select: none;
    padding: 0 0.1rem;
  }
  .lsp-grip:active { cursor: grabbing; }
  .lsp-vis {
    width: 22px; height: 22px; flex-shrink: 0;
    background: transparent; border: none; cursor: pointer;
    font-size: 0.85rem; padding: 0;
  }
  .lsp-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
  .lsp-name {
    font-size: 0.78rem; font-weight: 700; color: #111;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    display: flex; align-items: center; gap: 0.35rem;
  }
  .lsp-pane {
    flex-shrink: 0;
    width: 18px; height: 18px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 4px; border: 1.5px solid #111;
    font-family: 'Outfit', sans-serif;
    font-size: 0.65rem; font-weight: 800; line-height: 1;
    padding: 0;
    background: #fff; color: #111;
  }
  .lsp-pane.left { background: #2563eb; color: #fff; border-color: #2563eb; }
  .lsp-pane.right { background: #f59e0b; color: #fff; border-color: #f59e0b; }
  .lsp-slider { width: 100%; height: 4px; cursor: pointer; }
  .lsp-x {
    width: 22px; height: 22px; flex-shrink: 0;
    background: #fff; border: 1.5px solid #111; border-radius: 999px;
    font: inherit; font-size: 0.9rem; font-weight: 800; line-height: 1;
    cursor: pointer; padding: 0; color: #666;
  }
  .lsp-x:hover { background: #fee2e2; color: #b91c1c; }

  .lsp-base {
    flex-shrink: 0;
    margin-top: 0.5rem; padding-top: 0.4rem;
    border-top: 1.5px dashed #d9d4c0;
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .lsp-base-label {
    font-size: 0.6rem; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.05em;
    color: #777;
  }
  .lsp-base-pills { display: flex; gap: 0.25rem; }
  .lsp-base-pill {
    flex: 1;
    padding: 0.3rem 0.4rem;
    background: #fff; color: #111;
    border: 1.5px solid #111; border-radius: 6px;
    font: inherit; font-family: 'Outfit', sans-serif;
    font-size: 0.72rem; font-weight: 700;
    cursor: pointer;
    text-align: center;
    white-space: nowrap;
  }
  .lsp-base-pill:hover { background: #fafaf7; }
  .lsp-base-pill.on { background: #111; color: #fff; }
</style>
