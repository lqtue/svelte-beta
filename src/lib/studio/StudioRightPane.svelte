<!--
  StudioRightPane.svelte — right pane for /studio.

  Mirrors CreateRightPane shape using SidebarCard containers:
    • Project header   — title (dblclick rename) + auto-save indicator
    • Annotations      — draw mode chips + list of features
    • Inspector        — selected annotation editor, or empty hint
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type {
    MapListItem,
    AnnotationSummary,
    DrawingMode,
    AnnotationSet,
  } from '$lib/map/types';
  import SidebarCard from '$lib/ui/catalog/SidebarCard.svelte';
  import StudioAnimationPanel from './StudioAnimationPanel.svelte';

  const dispatch = createEventDispatcher<{
    rename: { id: string; label: string };
    changeColor: { id: string; color: string };
    updateDetails: { id: string; details: string };
    toggleVisibility: { id: string };
    delete: { id: string };
    select: { id: string | null };
    zoomTo: { id: string };
    setDrawingMode: { mode: DrawingMode | null };
    toggleCollapse: void;
    zoomToMap: { map: MapListItem };
    clear: void;
    exportGeoJSON: void;
    importFile: { file: File };
    importOSM: void;
    save: void;
    backToLibrary: void;
    renameProject: { title: string };
  }>();

  export let project: AnnotationSet | null = null;
  export let annotations: AnnotationSummary[] = [];
  export let selectedAnnotationId: string | null = null;
  export let selectedMap: MapListItem | null = null;
  export let drawingMode: DrawingMode | null = null;
  export let isSaving = false;
  export let saveSuccess = false;

  let geoJsonInputEl: HTMLInputElement | null = null;
  let notice: string | null = null;
  let noticeType: 'info' | 'error' | 'success' = 'info';

  // Title rename (dblclick → input, mirrors StoryHeaderPanel)
  let editingTitle = false;
  let titleDraft = '';
  let titleInputEl: HTMLInputElement | null = null;

  export function setNotice(
    message: string | null,
    tone: 'info' | 'error' | 'success' = 'info',
  ) {
    notice = message;
    noticeType = tone;
  }

  $: selected = annotations.find((a) => a.id === selectedAnnotationId) ?? null;
  $: selectedIndex = selected ? annotations.findIndex((a) => a.id === selected!.id) : -1;
  $: inspectorTitle = selected
    ? `${selectedIndex + 1}. ${selected.label || 'Untitled'}`
    : 'Inspector';

  function startEditTitle() {
    if (!project) return;
    titleDraft = project.title;
    editingTitle = true;
    requestAnimationFrame(() => { titleInputEl?.focus(); titleInputEl?.select(); });
  }
  function commitEditTitle() {
    if (!editingTitle) return;
    const next = titleDraft.trim();
    editingTitle = false;
    if (next && project && next !== project.title) {
      dispatch('renameProject', { title: next });
    }
  }
  function cancelEditTitle() { editingTitle = false; }
  function onTitleKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commitEditTitle(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEditTitle(); }
  }

  function pickDrawMode(mode: DrawingMode) {
    dispatch('setDrawingMode', { mode: drawingMode === mode ? null : mode });
  }

  function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const [file] = input.files ?? [];
    if (!file) return;
    dispatch('importFile', { file });
    input.value = '';
  }

  function selectAnnotation(id: string) {
    dispatch('select', { id: id === selectedAnnotationId ? null : id });
  }

  function typeBadge(type: string): string {
    switch (type) {
      case 'Point': return 'Pt';
      case 'LineString': return 'Ln';
      case 'Polygon': return 'Pg';
      default: return '??';
    }
  }
  function typeClass(type: string): string {
    switch (type) {
      case 'Point': return 'type-point';
      case 'LineString': return 'type-line';
      case 'Polygon': return 'type-polygon';
      default: return '';
    }
  }
</script>

<aside class="right-panel">
  <div class="sb-bar">
    <button type="button" class="sb-btn is-sm is-ghost"
      on:click={() => dispatch('backToLibrary')}
      aria-label="Back to library" title="Back to my projects">← Library</button>
    <span class="sb-bar-title">Studio editor</span>
    <button type="button" class="sb-btn is-icon is-ghost"
      on:click={() => dispatch('toggleCollapse')} aria-label="Collapse panel" title="Hide editor">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M9 3h10a2 2 0 012 2v14a2 2 0 01-2 2H9"/><path d="M5 8l4 4-4 4"/>
      </svg>
    </button>
  </div>

  <SidebarCard grow={0} padded={false}>
    <div class="sh">
      {#if editingTitle}
        <input
          class="sh-title-input"
          bind:this={titleInputEl}
          bind:value={titleDraft}
          on:blur={commitEditTitle}
          on:keydown={onTitleKey}
          placeholder="Project title"
        />
      {:else}
        <h2 class="sh-title" title="Double-click to rename"
          on:dblclick={startEditTitle}
          role="button" tabindex="0"
          on:keydown={(e) => { if (e.key === 'Enter' || e.key === 'F2') startEditTitle(); }}
        >{project?.title ?? 'Untitled project'}</h2>
      {/if}

      <div class="sh-meta">
        <span class="sh-autosave">
          {saveSuccess ? '✓ Saved' : isSaving ? 'Saving…' : 'Unsaved changes'}
        </span>
        <button type="button" class="sb-btn is-sm" class:is-success={saveSuccess}
          on:click={() => dispatch('save')} disabled={isSaving || saveSuccess}>
          {saveSuccess ? '✓ Saved' : isSaving ? '…' : 'Save'}
        </button>
      </div>

      {#if selectedMap}
        <div class="sh-map">
          <span class="sh-map-name">{selectedMap.name}</span>
          {#if selectedMap.year}<span class="sh-map-year">{selectedMap.year}</span>{/if}
          <button type="button" class="sb-btn is-sm is-ghost"
            on:click={() => dispatch('zoomToMap', { map: selectedMap })}>Zoom</button>
        </div>
      {/if}
    </div>
  </SidebarCard>

  <SidebarCard title="Annotations" grow={2} padded={false}>
    <svelte:fragment slot="head-actions">
      <button type="button" class="sb-btn is-sm is-ghost"
        on:click={() => dispatch('clear')} disabled={!annotations.length}>Clear</button>
      <button type="button" class="sb-btn is-sm is-ghost"
        on:click={() => dispatch('exportGeoJSON')} disabled={!annotations.length}>Export</button>
      <label class="sb-btn is-sm is-ghost upload">
        Import
        <input type="file" accept="application/geo+json,.geojson,.json"
          on:change={handleFileChange} bind:this={geoJsonInputEl} />
      </label>
      <button type="button" class="sb-btn is-sm is-ghost"
        on:click={() => dispatch('importOSM')} title="Import features from OpenStreetMap via Overpass">
        From OSM
      </button>
    </svelte:fragment>

    <div class="draw-controls">
      <button type="button" class="sb-btn is-block" class:is-on={drawingMode === 'point'}
        on:click={() => pickDrawMode('point')}>
        <span class="dot dot-point" aria-hidden="true"></span>
        {drawingMode === 'point' ? 'Placing…' : 'Point'}
      </button>
      <button type="button" class="sb-btn is-block" class:is-on={drawingMode === 'line'}
        on:click={() => pickDrawMode('line')}>
        <span class="dot dot-line" aria-hidden="true"></span>
        {drawingMode === 'line' ? 'Drawing…' : 'Line'}
      </button>
      <button type="button" class="sb-btn is-block" class:is-on={drawingMode === 'polygon'}
        on:click={() => pickDrawMode('polygon')}>
        <span class="dot dot-polygon" aria-hidden="true"></span>
        {drawingMode === 'polygon' ? 'Drawing…' : 'Polygon'}
      </button>
    </div>

    {#if notice}
      <p class="notice" class:errored={noticeType === 'error'} class:success={noticeType === 'success'}>
        {notice}
      </p>
    {/if}

    <div class="ann-list">
      {#if annotations.length}
        {#each annotations as a, i (a.id)}
          <div class="row" class:selected={a.id === selectedAnnotationId}
            on:click={() => selectAnnotation(a.id)}
            on:keydown={(e) => { if (e.key === 'Enter') selectAnnotation(a.id); }}
            role="button" tabindex="0">
            <span class="row-idx">{i + 1}</span>
            <span class="type-badge {typeClass(a.type)}">{typeBadge(a.type)}</span>
            <span class="row-label">{a.label || 'Untitled'}</span>
            <div class="row-actions">
              <button type="button" class="sb-btn is-sm is-ghost"
                on:click|stopPropagation={() => dispatch('zoomTo', { id: a.id })}>Zoom</button>
              <button type="button" class="sb-btn is-sm is-danger"
                on:click|stopPropagation={() => dispatch('delete', { id: a.id })}>×</button>
            </div>
          </div>
        {/each}
      {:else}
        <div class="empty">
          <p><strong>Draw on the map:</strong></p>
          <ul>
            <li>Click <strong>Point</strong>, <strong>Line</strong>, or <strong>Polygon</strong></li>
            <li>Then click on the map to draw</li>
            <li>Or <strong>Import</strong> a GeoJSON file</li>
          </ul>
        </div>
      {/if}
    </div>
  </SidebarCard>

  <SidebarCard title={inspectorTitle} grow={3}>
    <svelte:fragment slot="head-actions">
      {#if selected}
        <button type="button" class="sb-btn is-sm is-ghost"
          on:click={() => dispatch('select', { id: null })}>Close</button>
      {/if}
    </svelte:fragment>

    {#if selected}
      <div class="insp">
        <label class="field">
          <span class="field-label">Name</span>
          <input
            type="text"
            value={selected.label}
            placeholder="Annotation name"
            on:input={(e) => dispatch('rename', {
              id: selected!.id,
              label: (e.target as HTMLInputElement).value,
            })}
          />
        </label>

        <label class="field">
          <span class="field-label">Details</span>
          <textarea
            rows="4"
            value={selected.details ?? ''}
            placeholder="Optional notes"
            on:input={(e) => dispatch('updateDetails', {
              id: selected!.id,
              details: (e.target as HTMLTextAreaElement).value,
            })}
          ></textarea>
        </label>

        <div class="color-row">
          <span class="field-label">Colour</span>
          <input
            type="color"
            value={selected.color}
            on:input={(e) => dispatch('changeColor', {
              id: selected!.id,
              color: (e.target as HTMLInputElement).value,
            })}
          />
          <button type="button" class="sb-btn is-sm is-ghost"
            on:click={() => dispatch('toggleVisibility', { id: selected!.id })}>
            {selected.hidden ? 'Show' : 'Hide'}
          </button>
          <button type="button" class="sb-btn is-sm is-ghost"
            on:click={() => dispatch('zoomTo', { id: selected!.id })}>Zoom</button>
        </div>
      </div>
    {:else}
      <div class="empty">
        <p>Select an annotation to edit its name, notes, and colour.</p>
      </div>
    {/if}
  </SidebarCard>

  <StudioAnimationPanel
    on:addKeyframe
    on:removeKeyframe
    on:reorderKeyframe
    on:updateKeyframe
    on:play
    on:stop
    on:clearTimeline
    on:jumpToKeyframe
  />
</aside>

<style>
  .right-panel {
    display: flex; flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* Project header */
  .sh {
    display: flex; flex-direction: column;
    padding: 0.6rem 0.7rem 0.65rem;
    gap: 0.5rem;
  }
  .sh-title {
    margin: 0;
    font-family: var(--sb-font-display);
    font-size: 1.05rem; font-weight: 800; line-height: 1.2;
    color: var(--sb-text);
    overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    cursor: text; user-select: none;
    padding: 2px 4px; margin: -2px -4px;
    border-radius: var(--sb-radius-sm);
  }
  .sh-title:hover { background: var(--sb-accent-yellow); }
  .sh-title:focus { outline: 2px solid var(--sb-accent); outline-offset: -1px; }
  .sh-title-input {
    width: 100%; box-sizing: border-box;
    margin: -2px -4px; padding: 2px 4px;
    font-family: var(--sb-font-display);
    font-size: 1.05rem; font-weight: 800; line-height: 1.2;
    color: var(--sb-text);
    background: var(--sb-card-bg);
    border: var(--sb-border); border-radius: var(--sb-radius-sm);
  }
  .sh-title-input:focus { outline: none; box-shadow: 0 0 0 2px var(--sb-accent); }
  .sh-meta { display: flex; gap: 0.4rem; align-items: center; }
  .sh-autosave {
    flex: 1;
    font-family: var(--sb-font-display);
    font-size: 0.66rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--sb-text); opacity: 0.75;
  }
  .sh-map {
    display: flex; align-items: center; gap: 0.4rem;
    padding: 0.4rem 0.5rem;
    background: var(--sb-card-bg);
    border: var(--sb-border);
    border-radius: var(--sb-radius-sm);
    font-size: 0.78rem;
  }
  .sh-map-name { flex: 1; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sh-map-year { font-family: var(--sb-font-display); font-weight: 700; font-variant-numeric: tabular-nums; opacity: 0.7; }

  /* Draw controls — three sb-btn buttons in an even grid row */
  .draw-controls {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
    padding: 0.6rem 0.7rem;
    border-bottom: var(--sb-border);
  }
  .draw-controls :global(.sb-btn) {
    display: inline-flex; align-items: center; justify-content: center;
    gap: 0.4rem;
  }
  .dot {
    display: inline-block;
    width: 10px; height: 10px;
    border: 1.5px solid currentColor;
    flex-shrink: 0;
  }
  .dot-point { border-radius: 50%; background: currentColor; }
  .dot-line {
    width: 14px; height: 2px;
    background: currentColor;
    border: none;
  }
  .dot-polygon { background: transparent; }

  .notice {
    padding: 0.5rem 0.7rem; margin: 0;
    font-size: 0.78rem;
    background: var(--sb-card-bg);
    border-bottom: var(--sb-border);
  }
  .notice.success { background: #dcfce7; color: #166534; }
  .notice.errored { background: #fee2e2; color: #b91c1c; }

  /* Annotation list */
  .ann-list {
    flex: 1; overflow-y: auto;
    display: flex; flex-direction: column; gap: 0.4rem;
    padding: 0.6rem 0.7rem;
  }
  .row {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.45rem 0.55rem;
    background: var(--sb-card-bg);
    border: var(--sb-border);
    border-radius: var(--sb-radius-sm);
    cursor: pointer; transition: all 0.1s;
  }
  .row:hover { transform: translate(-1px, -1px); }
  .row.selected { box-shadow: 0 0 0 2px var(--sb-accent); }
  .row-idx {
    font-family: var(--sb-font-display);
    font-size: 0.7rem; font-weight: 700; opacity: 0.6;
    min-width: 1.2em; text-align: right;
  }
  .row-label { flex: 1; font-size: 0.85rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-actions { display: flex; gap: 0.25rem; }

  .type-badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 50%;
    font-size: 0.6rem; font-weight: 800;
    color: white; border: var(--sb-border);
    flex-shrink: 0;
  }
  .type-point { background: #d4af37; }
  .type-line { background: #5b8a72; }
  .type-polygon { background: #7b6b9e; }

  /* Inspector */
  .insp { display: flex; flex-direction: column; gap: 0.7rem; }
  .field { display: flex; flex-direction: column; gap: 0.3rem; }
  .field-label {
    font-family: var(--sb-font-display);
    font-size: 0.66rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--sb-text); opacity: 0.7;
  }
  .field input[type="text"], .field textarea {
    width: 100%; box-sizing: border-box;
    padding: 0.4rem 0.5rem;
    font-family: inherit; font-size: 0.85rem;
    background: var(--sb-card-bg);
    border: var(--sb-border); border-radius: var(--sb-radius-sm);
    color: var(--sb-text);
  }
  .field input[type="text"]:focus, .field textarea:focus {
    outline: none; box-shadow: 0 0 0 2px var(--sb-accent);
  }
  .field textarea { resize: vertical; min-height: 60px; }
  .color-row { display: flex; align-items: center; gap: 0.5rem; }
  .color-row input[type="color"] {
    width: 40px; height: 30px; padding: 0;
    border: var(--sb-border); border-radius: var(--sb-radius-sm);
    cursor: pointer; overflow: hidden;
  }

  .empty {
    padding: 1rem 0.7rem;
    font-size: 0.85rem;
    color: var(--sb-text); opacity: 0.7;
    line-height: 1.5;
  }
  .empty ul { padding-left: 1.2rem; margin: 0.4rem 0 0; }
  .empty li { margin-bottom: 0.3rem; }

  .upload { cursor: pointer; }
  .upload input { display: none; }
</style>
