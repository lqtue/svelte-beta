<!--
  LabelSidebar.svelte — Left panel content for Label Studio.
  Pin mode: legend selection + placed pins list.
  Trace/Select mode: shapes table with sort, filter, inline edit.
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
    updateFootprintMeta: { footprintId: string; name?: string; featureType?: FeatureType; category?: string | null };
    zoomToFootprint: { footprintId: string };
    submit: void;
  }>();

  export let legendItems: any[] = [];
  export let traceCategories: string[] = [];
  export let selectedLabel: string | null = null;
  export let placedPins: LabelPin[] = [];
  export let placedFootprints: FootprintSubmission[] = [];
  export let drawMode: 'pin' | 'trace' | 'select' = 'pin';
  export let newFootprintId: string | null = null;

  const FEATURE_COLORS: Record<FeatureType, string> = {
    building:    '#d4af37',
    land_plot:   '#61afef',
    road:        '#e06c75',
    waterway:    '#56b6c2',
    green_space: '#98c379',
    water_body:  '#4db8c8',
    other:       '#abb2bf',
  };
  function featureColor(ft: FeatureType) { return FEATURE_COLORS[ft] ?? '#abb2bf'; }

  const FEATURE_TYPES = Object.keys(FEATURE_TYPE_LABELS) as FeatureType[];

  // Build category options from trace categories
  $: categoryOptions = traceCategories.map(cat => ({ val: cat, label: cat }));

  // ── Pin mode: legend search ──
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

  /** Resolve a pin's label value to its display name via legendItems lookup. */
  function pinDisplayName(pin: LabelPin): string {
    // Check data.originalName first (transcription pins store the human name there)
    if (pin.data?.originalName) return pin.data.originalName;
    // Look up in legend: if it's an object item, show the label (human name)
    const item = legendItems.find(i => (typeof i === 'string' ? i : i.val) === pin.label);
    if (item && typeof item !== 'string') return item.label;
    // Fallback: show the raw label
    return pin.label;
  }

  // ── Shape table state ──
  let draftLabels: Record<string, string> = {};
  let inputEls: Record<string, HTMLInputElement> = {};

  // Sort
  type SortKey = 'name' | 'type' | 'category';
  let sortKey: SortKey = 'name';
  let sortAsc = true;

  function toggleSort(key: SortKey) {
    if (sortKey === key) { sortAsc = !sortAsc; }
    else { sortKey = key; sortAsc = true; }
  }

  // Filter
  let filterType: FeatureType | '' = '';
  let filterSearch = '';

  $: visibleFootprints = (() => {
    let list = [...placedFootprints];
    if (filterType) list = list.filter(fp => fp.featureType === filterType);
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase();
      list = list.filter(fp =>
        (fp.name ?? '').toLowerCase().includes(q) ||
        (fp.category ?? '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let va: string, vb: string;
      if (sortKey === 'name') { va = a.name ?? ''; vb = b.name ?? ''; }
      else if (sortKey === 'type') { va = a.featureType; vb = b.featureType; }
      else { va = a.category ?? ''; vb = b.category ?? ''; }
      const cmp = va.localeCompare(vb);
      return sortAsc ? cmp : -cmp;
    });
    return list;
  })();

  // Sync draft labels
  $: {
    for (const fp of placedFootprints) {
      if (!(fp.id in draftLabels)) draftLabels[fp.id] = fp.name ?? '';
    }
    const ids = new Set(placedFootprints.map((f) => f.id));
    for (const k of Object.keys(draftLabels)) {
      if (!ids.has(k)) delete draftLabels[k];
    }
    draftLabels = draftLabels;
  }

  // Autofocus newest shape
  $: if (newFootprintId) {
    tick().then(() => {
      inputEls[newFootprintId!]?.focus();
      inputEls[newFootprintId!]?.select();
    });
  }

  function commitLabel(fp: FootprintSubmission) {
    const draft = (draftLabels[fp.id] ?? '').trim();
    if (draft && draft !== fp.name) {
      dispatch('updateFootprintMeta', { footprintId: fp.id, name: draft });
    }
  }

  function commitType(fp: FootprintSubmission, ft: FeatureType) {
    if (ft !== fp.featureType) {
      dispatch('updateFootprintMeta', { footprintId: fp.id, featureType: ft });
    }
  }

  function commitCategory(fp: FootprintSubmission, cat: string) {
    const val = cat || null;
    if (val !== fp.category) {
      dispatch('updateFootprintMeta', { footprintId: fp.id, category: val });
    }
  }

  // Delete with confirm
  let confirmDeleteId: string | null = null;
  function requestDelete(fpId: string) { confirmDeleteId = fpId; }
  function cancelDelete() { confirmDeleteId = null; }
  function executeDelete(fpId: string) {
    confirmDeleteId = null;
    dispatch('removeFootprint', { footprintId: fpId });
  }

  // Collapsible sections
  let legendOpen = true;
  let pinsOpen = true;

  // Sort indicator
  function sortIcon(key: SortKey): string {
    if (sortKey !== key) return '';
    return sortAsc ? ' ↑' : ' ↓';
  }
</script>

<div class="sidebar-content">
  {#if drawMode === 'pin'}
    <!-- PIN MODE -->
    <section class="sidebar-section legend-section">
      <button type="button" class="section-toggle" on:click={() => (legendOpen = !legendOpen)}>
        <svg class="toggle-chevron" class:open={legendOpen} width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 4 10 8 6 12"/></svg>
        <h3 class="section-title">Legend</h3>
        <span class="section-count">{legendItems.length}</span>
      </button>
      {#if legendOpen}
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
      {/if}
    </section>

    <section class="sidebar-section">
      <button type="button" class="section-toggle" on:click={() => (pinsOpen = !pinsOpen)}>
        <svg class="toggle-chevron" class:open={pinsOpen} width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 4 10 8 6 12"/></svg>
        <h3 class="section-title">Placed Labels</h3>
        <span class="section-count">{placedPins.length}</span>
      </button>
      {#if pinsOpen}
        <div class="pin-list custom-scrollbar">
          {#each placedPins as pin (pin.id)}
            <div class="pin-item">
              <span class="pin-label">{pinDisplayName(pin)}</span>
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
      {/if}
    </section>

  {:else}
    <!-- TRACE / SELECT MODE: shapes table -->
    <div class="shapes-toolbar">
      <div class="shapes-search">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="7" cy="7" r="5"/><path d="M15 15l-3.5-3.5"/>
        </svg>
        <input type="text" placeholder="Filter shapes…" bind:value={filterSearch} class="shapes-search-input" />
      </div>
      <select class="filter-type-select" bind:value={filterType} aria-label="Filter by type">
        <option value="">All types</option>
        {#each FEATURE_TYPES as ft}
          <option value={ft}>{FEATURE_TYPE_LABELS[ft]}</option>
        {/each}
      </select>
      <span class="shapes-count">{visibleFootprints.length}{visibleFootprints.length !== placedFootprints.length ? ` / ${placedFootprints.length}` : ''}</span>
    </div>

    <div class="shapes-table-wrap custom-scrollbar">
      <table class="shapes-table">
        <thead>
          <tr>
            <th class="col-dot"></th>
            <th class="col-name sortable" on:click={() => toggleSort('name')}>Name{sortIcon('name')}</th>
            <th class="col-type sortable" on:click={() => toggleSort('type')}>Type{sortIcon('type')}</th>
            <th class="col-cat sortable" on:click={() => toggleSort('category')}>Category{sortIcon('category')}</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {#each visibleFootprints as fp (fp.id)}
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <tr class="shape-tr" on:dblclick={() => dispatch('zoomToFootprint', { footprintId: fp.id })} title="Double-click to zoom">
              <td class="col-dot"><span class="dot" style="background:{featureColor(fp.featureType)}"></span></td>
              <td class="col-name">
                <input
                  class="cell-input"
                  type="text"
                  bind:value={draftLabels[fp.id]}
                  bind:this={inputEls[fp.id]}
                  placeholder="Name…"
                  on:blur={() => commitLabel(fp)}
                  on:keydown={(e) => { if (e.key === 'Enter') { commitLabel(fp); e.currentTarget.blur(); } }}
                  aria-label="Shape name"
                />
              </td>
              <td class="col-type">
                <div class="dropdown-wrap">
                  <select
                    class="cell-select"
                    value={fp.featureType}
                    on:change={(e) => commitType(fp, e.currentTarget.value as FeatureType)}
                    aria-label="Feature type"
                  >
                    <option value="other" disabled={fp.featureType !== 'other'}>— Type —</option>
                    {#each FEATURE_TYPES as ft}
                      {#if ft !== 'other'}
                        <option value={ft}>{FEATURE_TYPE_LABELS[ft]}</option>
                      {/if}
                    {/each}
                    <option value="other">Other</option>
                  </select>
                  <svg class="dropdown-chevron" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"/></svg>
                </div>
              </td>
              <td class="col-cat">
                <div class="dropdown-wrap">
                  <select
                    class="cell-select"
                    value={fp.category ?? ''}
                    on:change={(e) => commitCategory(fp, e.currentTarget.value)}
                    aria-label="Category"
                  >
                    <option value="">— Category —</option>
                    {#each categoryOptions as opt}
                      <option value={opt.val}>{opt.label}</option>
                    {/each}
                  </select>
                  <svg class="dropdown-chevron" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"/></svg>
                </div>
              </td>
              <td class="col-actions">
                {#if confirmDeleteId === fp.id}
                  <button type="button" class="row-action confirm-yes" on:click={() => executeDelete(fp.id)} title="Confirm delete">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                  <button type="button" class="row-action confirm-no" on:click={cancelDelete} title="Cancel">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                {:else}
                  <button type="button" class="row-action zoom-action"
                    on:click={() => dispatch('zoomToFootprint', { footprintId: fp.id })}
                    aria-label="Zoom to shape" title="Zoom">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
                  </button>
                  <button type="button" class="row-action delete-action"
                    on:click={() => requestDelete(fp.id)}
                    aria-label="Remove shape" title="Delete">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if !placedFootprints.length}
        <p class="empty-state table-empty">
          {drawMode === 'trace' ? 'Draw a shape on the map to start.' : 'No shapes yet.'}
        </p>
      {:else if !visibleFootprints.length}
        <p class="empty-state table-empty">No shapes match the current filter.</p>
      {/if}
    </div>

    <div class="hint-bar">
      {#if drawMode === 'trace'}
        <kbd>Enter</kbd> or double-click to finish · <kbd>Ctrl+Z</kbd> undo · <kbd>Esc</kbd> cancel
      {:else}
        Click shape to select · drag vertices to edit · <kbd>Delete</kbd> to remove
      {/if}
    </div>
  {/if}
</div>

<style>
  .sidebar-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ── Collapsible section toggle ── */
  .section-toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: none;
    background: var(--color-white);
    cursor: pointer;
    border-bottom: var(--border-thin);
    transition: background 0.1s;
  }

  .section-toggle:hover {
    background: var(--color-gray-100);
  }

  .section-toggle .section-title {
    margin: 0;
    font-family: var(--font-family-base);
    font-size: 0.8rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-text);
  }

  .section-count {
    margin-left: auto;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--color-text);
    opacity: 0.4;
    background: var(--color-bg);
    padding: 0.1rem 0.4rem;
    border-radius: var(--radius-sm);
    border: var(--border-thin);
  }

  .toggle-chevron {
    flex-shrink: 0;
    opacity: 0.4;
    transition: transform 0.15s ease;
  }

  .toggle-chevron.open {
    transform: rotate(90deg);
  }

  /* ── Shapes toolbar ── */
  .shapes-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 0.75rem;
    border-bottom: var(--border-thin);
    background: var(--color-white);
    flex-shrink: 0;
  }

  .shapes-search {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex: 1;
    min-width: 0;
    background: var(--color-bg);
    border: var(--border-thin);
    border-radius: var(--radius-sm);
    padding: 0.3rem 0.5rem;
  }

  .shapes-search svg {
    flex-shrink: 0;
    opacity: 0.5;
  }

  .shapes-search-input {
    border: none;
    background: none;
    outline: none;
    font-family: var(--font-family-base);
    font-size: 0.75rem;
    width: 100%;
    color: var(--color-text);
  }

  .filter-type-select {
    font-family: var(--font-family-base);
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.3rem 0.4rem;
    border: var(--border-thin);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-text);
    cursor: pointer;
    flex-shrink: 0;
  }

  .shapes-count {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--color-text);
    opacity: 0.5;
    flex-shrink: 0;
    white-space: nowrap;
  }

  /* ── Shapes table ── */
  .shapes-table-wrap {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }

  .shapes-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-family-base);
    font-size: 0.75rem;
  }

  .shapes-table thead {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--color-white);
  }

  .shapes-table th {
    padding: 0.4rem 0.4rem;
    text-align: left;
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text);
    opacity: 0.5;
    border-bottom: var(--border-thick);
    white-space: nowrap;
    user-select: none;
  }

  .shapes-table th.sortable {
    cursor: pointer;
  }

  .shapes-table th.sortable:hover {
    opacity: 0.9;
    color: var(--color-primary);
  }

  .shapes-table td {
    padding: 0.2rem 0.4rem;
    border-bottom: 1px solid var(--color-gray-200, #eee);
    vertical-align: middle;
  }

  .shape-tr:hover td {
    background: var(--color-gray-100);
  }

  .col-dot {
    width: 20px;
    text-align: center;
    padding-left: 0.5rem;
  }

  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid rgba(0,0,0,0.15);
  }

  .col-name {
    min-width: 70px;
  }

  .col-type {
    min-width: 75px;
  }

  .col-cat {
    min-width: 80px;
  }

  .col-actions {
    width: 52px;
    text-align: right;
    white-space: nowrap;
    padding-right: 0.5rem;
  }

  .cell-input {
    width: 100%;
    border: none;
    background: none;
    outline: none;
    font-family: var(--font-family-base);
    font-size: 0.75rem;
    color: var(--color-text);
    padding: 0.2rem 0;
  }

  .cell-input:focus {
    background: var(--color-yellow);
    border-radius: 2px;
    padding: 0.2rem 0.25rem;
    margin: 0 -0.25rem;
  }

  /* ── Dropdown wrapper (visible chevron) ── */
  .dropdown-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .cell-select {
    width: 100%;
    border: 1px solid var(--color-gray-200, #ddd);
    border-radius: 3px;
    background: var(--color-bg);
    font-family: var(--font-family-base);
    font-size: 0.7rem;
    color: var(--color-text);
    cursor: pointer;
    padding: 0.2rem 1.2rem 0.2rem 0.3rem;
    -webkit-appearance: none;
    appearance: none;
  }

  .cell-select:focus {
    outline: 2px solid var(--color-blue);
    outline-offset: -1px;
    border-color: var(--color-blue);
  }

  .dropdown-chevron {
    position: absolute;
    right: 0.3rem;
    pointer-events: none;
    opacity: 0.4;
  }

  /* ── Row actions ── */
  .row-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--color-text);
    opacity: 0.3;
    border-radius: var(--radius-sm);
    transition: all 0.1s;
    padding: 0;
    font-size: 0.85rem;
  }

  .row-action:hover {
    opacity: 1;
    background: var(--color-gray-100);
  }

  .delete-action:hover {
    color: #b91c1c;
    background: #fee2e2;
  }

  .confirm-yes {
    opacity: 0.8;
    color: #b91c1c;
    background: #fee2e2;
  }

  .confirm-yes:hover {
    opacity: 1;
    background: #fecaca;
    color: #991b1b;
  }

  .confirm-no {
    opacity: 0.6;
  }

  .confirm-no:hover {
    opacity: 1;
    background: var(--color-gray-100);
  }

  .table-empty {
    padding: 2rem 1rem;
    text-align: center;
  }

  .hint-bar {
    padding: 0.5rem 1rem;
    font-size: 0.7rem;
    color: var(--color-text);
    opacity: 0.5;
    border-top: var(--border-thin);
    background: var(--color-white);
    flex-shrink: 0;
    text-align: center;
  }

  .hint-bar kbd {
    display: inline-block;
    padding: 0.1rem 0.35rem;
    font-size: 0.65rem;
    font-family: var(--font-family-base);
    background: var(--color-bg);
    border: var(--border-thin);
    border-radius: 3px;
    font-weight: 700;
  }
</style>
