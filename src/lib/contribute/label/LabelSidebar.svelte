<!--
  LabelSidebar.svelte — Right panel for Label Studio.
  Pin mode: legend selection + placed pins list.
  Trace/Select mode: inline shapes list with editable name + type per row.
-->
<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
  import "$lib/styles/components/label.css";
  import type { LabelPin, FootprintSubmission, FeatureType } from "./types";
  import { FEATURE_TYPE_LABELS } from "./types";

  function isMapped(item: any, pins: LabelPin[]) {
    const val = typeof item === "string" ? item : item.val;
    if (typeof item !== "string") return pins.some((p) => p.label === val);
    return false;
  }
  function getLabel(item: any) { return typeof item === "string" ? item : item.label; }
  function getValue(item: any) { return typeof item === "string" ? item : item.val; }

  const dispatch = createEventDispatcher<{
    selectLabel: { label: string };
    removePin: { pinId: string };
    removeFootprint: { footprintId: string };
    updateFootprintMeta: { footprintId: string; label?: string; featureType?: FeatureType };
    zoomToFootprint: { footprintId: string };
    submit: void;
  }>();

  export let legendItems: any[] = [];
  export let selectedLabel: string | null = null;
  export let placedPins: LabelPin[] = [];
  export let placedFootprints: FootprintSubmission[] = [];
  export let drawMode: 'pin' | 'trace' | 'select' = 'pin';
  export let newFootprintId: string | null = null;

  // Color dot per feature type
  const FEATURE_COLORS: Record<FeatureType, string> = {
    building: '#d4af37',
    land_plot: '#61afef',
    road: '#e06c75',
    waterway: '#56b6c2',
    other: '#abb2bf',
  };
  function featureColor(ft: FeatureType) { return FEATURE_COLORS[ft] ?? '#abb2bf'; }

  let searchQuery = "";
  $: filteredItems = searchQuery.trim()
    ? legendItems.filter((item) => {
        const q = searchQuery.trim().toLowerCase();
        return getValue(item).toString().toLowerCase().includes(q) ||
               getLabel(item).toLowerCase().includes(q);
      })
    : legendItems;

  function selectLabel(label: string) {
    selectedLabel = label;
    dispatch("selectLabel", { label });
  }

  // Draft labels map: footprintId → current text in the input
  let draftLabels: Record<string, string> = {};
  // Input element refs for autofocus
  let inputEls: Record<string, HTMLInputElement> = {};

  // Sync draftLabels when placedFootprints changes (new shapes added, old ones removed)
  $: {
    for (const fp of placedFootprints) {
      if (!(fp.id in draftLabels)) draftLabels[fp.id] = fp.label ?? '';
    }
    const ids = new Set(placedFootprints.map((f) => f.id));
    for (const k of Object.keys(draftLabels)) {
      if (!ids.has(k)) delete draftLabels[k];
    }
    draftLabels = draftLabels; // trigger reactivity
  }

  // Autofocus the name input of the newest drawn shape
  $: if (newFootprintId) {
    tick().then(() => {
      inputEls[newFootprintId!]?.focus();
      inputEls[newFootprintId!]?.select();
    });
  }

  function commitLabel(fp: FootprintSubmission) {
    const draft = (draftLabels[fp.id] ?? '').trim();
    if (draft && draft !== fp.label) {
      dispatch('updateFootprintMeta', { footprintId: fp.id, label: draft });
    }
  }

  function commitType(fp: FootprintSubmission, ft: FeatureType) {
    if (ft !== fp.featureType) {
      dispatch('updateFootprintMeta', { footprintId: fp.id, featureType: ft });
    }
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <a href="/" class="back-link small" title="Back to home">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 6l6-4.5L14 6v7.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 13.5V6z"/>
        <path d="M6 15V9h4v6"/>
      </svg>
    </a>
    <h3 class="sidebar-header-title">Label Studio</h3>
  </div>

  {#if drawMode === 'pin'}
    <!-- PIN MODE: legend list + placed pins -->
    <section class="sidebar-section legend-section">
      <h3 class="section-title">Legend</h3>
      <p class="section-hint">Select a label, then click on the map to place it.</p>
      <div class="legend-search">
        <svg class="legend-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="7" cy="7" r="5"/>
          <path d="M15 15l-3.5-3.5"/>
        </svg>
        <input type="text" class="legend-search-input" placeholder="Search…" bind:value={searchQuery} />
      </div>
      <div class="legend-list">
        {#each filteredItems as item}
          {@const val = getValue(item)}
          {@const label = getLabel(item)}
          {@const mapped = isMapped(item, placedPins)}
          <button type="button" class="legend-item"
            class:list-item={typeof item !== "string"}
            class:selected={val === selectedLabel}
            class:mapped
            on:click={() => !mapped && selectLabel(val)}
            disabled={mapped}
            title={mapped ? "Already mapped" : label}
          >
            {#if typeof item !== "string"}
              <span class="item-val">{val}</span>
              <span class="item-label">{label}</span>
            {:else}{item}{/if}
          </button>
        {/each}
        {#if !legendItems.length}
          <p class="empty-state">No legend items for this task.</p>
        {:else if !filteredItems.length}
          <p class="empty-state">No matches for "{searchQuery}"</p>
        {/if}
      </div>
    </section>

    <section class="sidebar-section">
      <h3 class="section-title">Placed Labels ({placedPins.length})</h3>
      <div class="pin-list custom-scrollbar">
        {#each placedPins as pin (pin.id)}
          <div class="pin-item">
            <span class="pin-label">{pin.label}</span>
            <span class="pin-coords">({Math.round(pin.pixelX)}, {Math.round(pin.pixelY)})</span>
            <button type="button" class="pin-remove"
              on:click={() => dispatch("removePin", { pinId: pin.id })}
              aria-label="Remove pin">&times;</button>
          </div>
        {/each}
        {#if !placedPins.length}
          <p class="empty-state">No labels placed yet.</p>
        {/if}
      </div>
    </section>

  {:else}
    <!-- TRACE / SELECT MODE: inline shapes list -->
    <section class="sidebar-section shapes-section">
      <h3 class="section-title">Shapes ({placedFootprints.length})</h3>
      <div class="shapes-list custom-scrollbar">
        {#each placedFootprints as fp (fp.id)}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="shape-row"
            on:dblclick={() => dispatch('zoomToFootprint', { footprintId: fp.id })}
            title="Double-click to zoom to shape"
          >
            <span class="shape-dot" style="background:{featureColor(fp.featureType)}"></span>
            <input
              class="shape-name-input"
              type="text"
              bind:value={draftLabels[fp.id]}
              bind:this={inputEls[fp.id]}
              placeholder="Name…"
              on:blur={() => commitLabel(fp)}
              on:keydown={(e) => { if (e.key === 'Enter') { commitLabel(fp); e.currentTarget.blur(); } }}
              aria-label="Shape name"
            />
            <select
              class="shape-type-select"
              value={fp.featureType}
              on:change={(e) => commitType(fp, e.currentTarget.value as FeatureType)}
              aria-label="Feature type"
            >
              {#each Object.entries(FEATURE_TYPE_LABELS) as [ft, lbl]}
                <option value={ft}>{lbl}</option>
              {/each}
            </select>
            <button type="button" class="pin-remove"
              on:click={() => dispatch('removeFootprint', { footprintId: fp.id })}
              aria-label="Remove shape">&times;</button>
          </div>
        {/each}
        {#if !placedFootprints.length}
          <p class="empty-state">
            {drawMode === 'trace' ? 'Draw a shape on the map to start.' : 'No shapes yet.'}
          </p>
        {/if}
      </div>
    </section>

    <div class="hint-bar">
      {#if drawMode === 'trace'}
        Draw polygons · <kbd>Enter</kbd> or double-click to finish · <kbd>Ctrl+Z</kbd> undo · <kbd>Esc</kbd> cancel
      {:else}
        Click shape to select · drag vertices to edit · <kbd>Delete</kbd> to remove · double-click row to zoom
      {/if}
    </div>
  {/if}

  <div class="sidebar-footer">
    <button type="button" class="submit-btn"
      disabled={placedPins.length === 0 && placedFootprints.length === 0}
      on:click={() => dispatch("submit")}
    >
      Done — Next Task
    </button>
  </div>
</aside>
