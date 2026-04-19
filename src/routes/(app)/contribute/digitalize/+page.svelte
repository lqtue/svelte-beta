<!--
  /contribute/digitalize — Unified map digitization workflow.

  Two phases share the same ImageShell canvas:

  Triage   — Human sets neatline (amber drag rect) and tile priority by clicking
              tile cells (normal / low-res / skip). Runs OCR batch via API.

  OCR Review — Validate/reject OCR extraction bboxes. Verbatim reuse of
               OcrBboxTool + OcrSidebar from /contribute/label.

  Tile priority cycle: click once → low-res (amber) · again → skip (gray) · again → normal.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import OlMap from 'ol/Map';
  import NavBar from '$lib/ui/NavBar.svelte';
  import ToolLayout from '$lib/shell/ToolLayout.svelte';
  import ImageShell from '$lib/shell/ImageShell.svelte';
  import MapSearchBar from '$lib/ui/MapSearchBar.svelte';
  import OcrSidebar from '$lib/contribute/ocr/OcrSidebar.svelte';
  import OcrBboxTool from '$lib/contribute/ocr/OcrBboxTool.svelte';
  import TriageSidebar from '$lib/contribute/digitalize/TriageSidebar.svelte';
  import TriageTool from '$lib/contribute/digitalize/TriageTool.svelte';
  import type { OcrExtraction } from '$lib/contribute/ocr/types';
  import type { TileOverrides } from '$lib/contribute/digitalize/tileParams';
  import { getSupabaseContext } from '$lib/supabase/context';
  import { annotationUrlForSource } from '$lib/shell/warpedOverlay';
  import { fetchLabelMaps } from '$lib/supabase/labels';
  import type { LabelMapInfo } from '$lib/supabase/labels';

  const { supabase } = getSupabaseContext();

  const OCR_CATEGORIES = ['street','hydrology','place','building','institution','legend','title','other'] as const;
  const CAT_COLORS: Record<string, string> = {
    street: '#ef4444', hydrology: '#3b82f6', place: '#60a5fa',
    building: '#22c55e', institution: '#f97316', legend: '#a855f7',
    title: '#06b6d4', other: '#9ca3af',
  };

  // ── Shared ────────────────────────────────────────────────────────────────────
  let maps: LabelMapInfo[] = [];
  let currentMap: LabelMapInfo | null = null;
  let iiifInfoUrl: string | null = null;
  let imgWidth = 0;
  let imgHeight = 0;
  let map: OlMap | null = null;

  // ── Layout ────────────────────────────────────────────────────────────────────
  let sidebarCollapsed = false;
  let isMobile = false;
  let isCompact = false;

  // ── Phase ─────────────────────────────────────────────────────────────────────
  let phase: 'triage' | 'ocr' = 'triage';

  // ── Triage state ──────────────────────────────────────────────────────────────
  let neatline: [number, number, number, number] | null = null;
  let tileSize = 2400;
  let overlap = 300;
  let runId = '';
  let minConfidence = 0.5;
  let tileOverrides: TileOverrides = {};
  let ocrRunning = false;
  let ocrError = '';
  let cliCommand: string | null = null;
  let existingRuns: Record<string, { n: number; categories: Record<string, number> }> = {};

  // Default neatline to full image once dimensions are known
  $: if (imgWidth && imgHeight && neatline === null) {
    neatline = [0, 0, imgWidth, imgHeight];
  }

  // Clear tile overrides when tile grid changes (new neatline or targetCalls)
  let prevGridKey = '';
  $: {
    const key = `${neatline?.join(',')}_${tileSize}_${overlap}`;
    if (prevGridKey && key !== prevGridKey) tileOverrides = {};
    prevGridKey = key;
  }

  // Persist triage config to localStorage
  $: if (currentMap?.id && neatline) {
    try {
      localStorage.setItem(
        `digitalize-triage-${currentMap.id}`,
        JSON.stringify({ neatline, tile_size: tileSize, overlap, tile_overrides: tileOverrides })
      );
    } catch { /* storage quota or SSR */ }
  }

  // ── OCR Review state (mirrors /contribute/label exactly) ─────────────────────
  let ocrSidebar: OcrSidebar;
  let ocrExtractions: OcrExtraction[] = [];
  let visibleExtractionIds = new Set<string>();
  let selectedExtractionId: string | null = null;
  let isolationMode = false;
  let drawMode = false;

  // global_x/y/w/h from the OCR pipeline are already in full image pixel coordinates
  // (tile offset + render-px bbox scaled to tile dimensions). No further scaling needed.
  $: displayExtractions = ocrExtractions;

  // ── Map loading ───────────────────────────────────────────────────────────────
  async function loadMaps() {
    try { maps = await fetchLabelMaps(supabase); }
    catch (err) { console.error('[Digitalize] Failed to load maps:', err); }
  }

  async function selectMap(m: LabelMapInfo) {
    if (currentMap?.id === m.id) return;
    currentMap = m;
    iiifInfoUrl = null;
    imgWidth = 0; imgHeight = 0;
    neatline = null;
    ocrExtractions = [];
    selectedExtractionId = null;
    existingRuns = {};
    ocrError = '';

    // Restore persisted triage config
    try {
      const saved = localStorage.getItem(`digitalize-triage-${m.id}`);
      if (saved) {
        const data = JSON.parse(saved);
        if (Array.isArray(data.neatline) && data.neatline.length === 4) neatline = data.neatline;
        if (data.tile_size) tileSize = data.tile_size;
        if (data.overlap) overlap = data.overlap;
        if (data.tile_overrides) tileOverrides = data.tile_overrides;
      }
    } catch { /* ignore */ }

    await resolveIiifUrl();
    await checkExistingRuns();
  }

  async function resolveIiifUrl() {
    // Prefer iiif_image from the maps table — direct and reliable
    if (currentMap?.iiifImage) {
      iiifInfoUrl = `${currentMap.iiifImage}/info.json`;
      return;
    }
    // Fallback: resolve from Allmaps annotation
    if (!currentMap?.allmapsId) return;
    try {
      const res = await fetch(annotationUrlForSource(currentMap.allmapsId));
      if (!res.ok) throw new Error(`Allmaps fetch failed: ${res.status}`);
      const annotation = await res.json();
      const sourceId = annotation.items?.[0]?.target?.source?.id;
      if (!sourceId || !String(sourceId).startsWith('http')) throw new Error('No valid source ID in annotation');
      iiifInfoUrl = `${sourceId}/info.json`;
    } catch (err) {
      console.error('[Digitalize] Failed to resolve IIIF URL:', err);
    }
  }

  async function checkExistingRuns() {
    if (!currentMap?.id) return;
    try {
      const res = await fetch(`/api/admin/maps/${currentMap.id}/ocr`);
      if (!res.ok) return;
      const data = await res.json();
      existingRuns = data.runs ?? {};
      // Auto-switch to OCR phase if runs exist
      if (Object.keys(existingRuns).length > 0) phase = 'ocr';
    } catch { /* ignore */ }
  }

  // ── Triage handlers ───────────────────────────────────────────────────────────
  async function runOcr() {
    if (!currentMap || !neatline || ocrRunning) return;
    ocrRunning = true;
    ocrError = '';
    cliCommand = null;
    runId = runId || new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    try {
      const res = await fetch(`/api/admin/maps/${currentMap.id}/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          neatline,
          tile_size: tileSize,
          overlap,
          run_id: runId,
          min_confidence: minConfidence,
          tile_overrides: Object.keys(tileOverrides).length > 0 ? tileOverrides : undefined,
        }),
      });
      const data = await res.json();
      if (data.cli_only) { cliCommand = data.cli_command; return; }
      if (!res.ok) { ocrError = data.message ?? res.statusText; return; }
      await checkExistingRuns();
      phase = 'ocr';
      await tick();
      ocrSidebar?.load?.();
    } catch (e: any) {
      ocrError = e.message;
    } finally {
      ocrRunning = false;
    }
  }

  function loadRun(e: CustomEvent<{ runId: string }>) {
    phase = 'ocr';
    tick().then(() => ocrSidebar?.load?.());
  }

  // ── OCR review handlers (verbatim from /contribute/label) ────────────────────
  function handleLoaded(e: CustomEvent<{ extractions: OcrExtraction[] }>) {
    ocrExtractions = e.detail.extractions;
    selectedExtractionId = null;
  }

  function handleSelect(e: CustomEvent<{ id: string }>) {
    selectedExtractionId = e.detail.id;
    ocrSidebar?.focusRow?.(e.detail.id);
  }

  function handleFilter(e: CustomEvent<{ extractions: OcrExtraction[] }>) {
    visibleExtractionIds = new Set(e.detail.extractions.map(ex => ex.id));
  }

  function handleZoomToExtraction(e: CustomEvent<{ globalX: number; globalY: number; globalW: number; globalH: number }>) {
    if (!map) return;
    const { globalX, globalY, globalW, globalH } = e.detail;
    map.getView().fit([globalX, -(globalY + globalH), globalX + globalW, -globalY], {
      padding: [100, 100, 100, 100], duration: 400,
    });
  }

  async function handleMove(e: CustomEvent<{ id: string; global_x: number; global_y: number; global_w: number; global_h: number }>) {
    if (!currentMap) return;
    const { id, global_x, global_y, global_w, global_h } = e.detail;
    ocrExtractions = ocrExtractions.map(ex => ex.id === id ? { ...ex, global_x, global_y, global_w, global_h } : ex);
    await fetch(`/api/admin/maps/${currentMap.id}/ocr-review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, global_x, global_y, global_w, global_h }),
    });
  }

  async function handleDraw(e: CustomEvent<{ global_x: number; global_y: number; global_w: number; global_h: number }>) {
    if (!currentMap) return;
    drawMode = false;
    const { global_x, global_y, global_w, global_h } = e.detail;
    const activeRunId = ocrSidebar?.getRunId?.() ?? 'manual';
    const res = await fetch(`/api/admin/maps/${currentMap.id}/ocr-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: activeRunId, global_x, global_y, global_w, global_h }),
    });
    if (!res.ok) return;
    const { id } = await res.json();
    const newExt: OcrExtraction = {
      id, tile_x: 0, tile_y: 0, tile_w: 0, tile_h: 0,
      global_x, global_y, global_w, global_h,
      category: 'other', text: '', text_validated: null, category_validated: null,
      confidence: 1.0, status: 'pending',
    };
    ocrExtractions = [...ocrExtractions, newExt];
    selectedExtractionId = id;
    panelText = '';
    panelCategory = 'other';
  }

  // ── Bbox edit panel ───────────────────────────────────────────────────────
  $: selectedExtraction = ocrExtractions.find(e => e.id === selectedExtractionId) ?? null;
  let panelText = '';
  let panelCategory = '';
  let panelSaving = false;

  // Reset panel when selection changes
  $: if (selectedExtraction) {
    panelText = selectedExtraction.text_validated ?? selectedExtraction.text;
    panelCategory = selectedExtraction.category_validated ?? selectedExtraction.category;
  }

  async function panelSave(status: 'validated' | 'rejected' | 'pending') {
    if (!currentMap || !selectedExtractionId) return;
    panelSaving = true;
    try {
      const res = await fetch(`/api/admin/maps/${currentMap.id}/ocr-review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedExtractionId, text: panelText, category: panelCategory, status }),
      });
      if (!res.ok) return;
      ocrExtractions = ocrExtractions.map(e => e.id === selectedExtractionId
        ? { ...e, text_validated: panelText, category_validated: panelCategory, status }
        : e);
      ocrSidebar?.load?.();
    } finally { panelSaving = false; }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && drawMode) drawMode = false;
  }

  onMount(loadMaps);
</script>

<svelte:window on:keydown={handleKeydown} />
<svelte:head>
  <title>{currentMap ? `${currentMap.name} — Digitalize` : 'Digitalize'} — Vietnam Map Archive</title>
  <link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="tool-page">
  <NavBar />
  <ToolLayout bind:sidebarCollapsed bind:isMobile bind:isCompact>

    <!-- Sidebar (desktop) -->
    <svelte:fragment slot="sidebar">
      <aside class="panel">
        <div class="panel-header">
          <a href="/contribute" class="home-link" aria-label="Back to Contribute">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M12.5 15L7.5 10L12.5 5"/>
            </svg>
            Contribute
          </a>
          <button type="button" class="collapse-btn" on:click={() => (sidebarCollapsed = true)} aria-label="Collapse">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M15 3H5a2 2 0 00-2 2v14a2 2 0 002 2h10"/><path d="M19 8l-4 4 4 4"/>
            </svg>
          </button>
        </div>

        {#if !currentMap}
          <div class="panel-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
            </svg>
            <p>Select a map to begin.</p>
          </div>
        {:else if phase === 'triage'}
          <TriageSidebar
            {imgWidth} {imgHeight} {iiifInfoUrl}
            bind:neatline bind:tileSize bind:overlap bind:runId bind:minConfidence
            {tileOverrides}
            {ocrRunning} {ocrError} {cliCommand}
            runs={existingRuns}
            on:runOcr={runOcr}
            on:loadRun={loadRun}
          />
        {:else}
          <OcrSidebar
            bind:this={ocrSidebar}
            mapId={currentMap.id}
            selectedId={selectedExtractionId}
            on:loaded={handleLoaded}
            on:filter={handleFilter}
            on:zoomToExtraction={handleZoomToExtraction}
          />
        {/if}

        <div class="panel-footer">
          <div class="phase-tabs">
            <button class="phase-tab" class:active={phase === 'triage'}
              on:click={() => (phase = 'triage')}>Triage</button>
            <button class="phase-tab" class:active={phase === 'ocr'}
              on:click={() => (phase = 'ocr')}>OCR Review</button>
          </div>
        </div>
      </aside>
    </svelte:fragment>

    <!-- Floating map picker -->
    <MapSearchBar
      maps={maps as any}
      selectedMapId={currentMap?.id ?? null}
      mapsOnly={true}
      on:selectMap={(e) => selectMap(e.detail.map as any)}
    />

    <!-- Canvas stage -->
    {#if currentMap && iiifInfoUrl}
      <ImageShell {iiifInfoUrl} bind:imgWidth bind:imgHeight bind:map>
        {#if phase === 'triage'}
          <TriageTool
            {imgWidth} {imgHeight}
            {neatline} {tileSize} {overlap} {tileOverrides}
            on:neatlineChange={(e) => { neatline = e.detail; }}
            on:tileOverridesChange={(e) => { tileOverrides = e.detail; }}
          />
        {:else}
          <OcrBboxTool
            extractions={displayExtractions}
            selectedId={selectedExtractionId}
            filteredIds={visibleExtractionIds}
            {isolationMode}
            {drawMode}
            on:select={handleSelect}
            on:move={handleMove}
            on:draw={handleDraw}
          />
        {/if}
      </ImageShell>

      <!-- Bbox edit panel — floats above the bottom bar when a bbox is selected -->
      {#if phase === 'ocr' && selectedExtraction}
        <div class="bbox-panel">
          <div class="bbox-panel-row">
            <span class="bbox-panel-cat-dot" style="background: {CAT_COLORS[selectedExtraction.category] ?? '#9ca3af'}"></span>
            <input
              class="bbox-panel-text"
              type="text"
              bind:value={panelText}
              placeholder="Label text…"
              on:keydown={(e) => { if (e.key === 'Enter') panelSave(selectedExtraction?.status === 'validated' ? 'validated' : 'validated'); }}
            />
            <select class="bbox-panel-cat" bind:value={panelCategory}>
              {#each OCR_CATEGORIES as cat}
                <option value={cat}>{cat}</option>
              {/each}
            </select>
          </div>
          <div class="bbox-panel-actions">
            <span class="bbox-panel-conf">{((selectedExtraction.confidence ?? 0) * 100).toFixed(0)}%</span>
            <button
              class="bbox-panel-btn validate"
              class:active={selectedExtraction.status === 'validated'}
              disabled={panelSaving}
              on:click={() => panelSave(selectedExtraction?.status === 'validated' ? 'pending' : 'validated')}
              title={selectedExtraction.status === 'validated' ? 'Unvalidate' : 'Validate'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {selectedExtraction.status === 'validated' ? 'Validated' : 'Validate'}
            </button>
            <button
              class="bbox-panel-btn reject"
              class:active={selectedExtraction.status === 'rejected'}
              disabled={panelSaving}
              on:click={() => panelSave(selectedExtraction?.status === 'rejected' ? 'pending' : 'rejected')}
              title={selectedExtraction.status === 'rejected' ? 'Unreject' : 'Reject'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              {selectedExtraction.status === 'rejected' ? 'Rejected' : 'Reject'}
            </button>
            <button class="bbox-panel-close" on:click={() => (selectedExtractionId = null)} title="Deselect">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
      {/if}
    {:else if !currentMap}
      <div class="empty-stage">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.2">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
        </svg>
        <p>Select a map to begin digitalization.</p>
        <a href="/catalog" class="catalog-link">Browse catalog →</a>
      </div>
    {:else}
      <div class="loading-stage">
        <div class="spinner"></div>
        <span>Loading map…</span>
      </div>
    {/if}

    <!-- Mobile sidebar -->
    <svelte:fragment slot="mobile-sidebar">
      <aside class="panel">
        <div class="panel-header">
          <a href="/contribute" class="home-link">← Contribute</a>
          <button type="button" class="collapse-btn" on:click={() => (sidebarCollapsed = true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {#if currentMap && phase === 'triage'}
          <TriageSidebar
            {imgWidth} {imgHeight} {iiifInfoUrl}
            bind:neatline bind:tileSize bind:overlap bind:runId bind:minConfidence
            {tileOverrides}
            {ocrRunning} {ocrError} {cliCommand}
            runs={existingRuns}
            on:runOcr={runOcr}
            on:loadRun={loadRun}
          />
        {:else if currentMap}
          <OcrSidebar
            mapId={currentMap.id}
            selectedId={selectedExtractionId}
            on:loaded={handleLoaded}
          />
        {:else}
          <div class="panel-empty">Select a map first.</div>
        {/if}

        <div class="panel-footer">
          <div class="phase-tabs">
            <button class="phase-tab" class:active={phase === 'triage'} on:click={() => (phase = 'triage')}>Triage</button>
            <button class="phase-tab" class:active={phase === 'ocr'} on:click={() => (phase = 'ocr')}>OCR</button>
          </div>
        </div>
      </aside>
    </svelte:fragment>
  </ToolLayout>

  <!-- Bottom bar -->
  {#if currentMap}
    <footer class="bottom-bar">
      {#if phase === 'triage'}
        <div class="bar-hint">Drag amber rect to set neatline · drag corners to resize · click tile to set priority</div>
      {:else}
        <div class="bar-hint">{drawMode ? 'Draw a rectangle to add bbox · Esc to cancel' : 'Click bbox to edit · drag to reposition'}</div>
        <div class="bar-divider"></div>
        <button type="button" class="tool-btn" class:active={drawMode}
          on:click={() => { drawMode = !drawMode; if (drawMode) selectedExtractionId = null; }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="3" y="3" width="18" height="18" rx="1"/>
            <path d="M12 8v8M8 12h8"/>
          </svg>
          <span>Add bbox</span>
        </button>
        <div class="bar-divider"></div>
        <button type="button" class="tool-btn" class:active={isolationMode}
          on:click={() => (isolationMode = !isolationMode)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="3"/><path d="M3 12c0 1 2 5 9 5s9-4 9-5-2-5-9-5-9 4-9 5z"/>
          </svg>
          <span>{isolationMode ? 'Focus On' : 'Focus'}</span>
        </button>
      {/if}
      <div class="bar-divider"></div>
      {#if !isMobile}
        <button type="button" class="tool-btn" on:click={() => (sidebarCollapsed = !sidebarCollapsed)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
          </svg>
          <span>{sidebarCollapsed ? 'Panel' : 'Hide'}</span>
        </button>
      {:else}
        <button type="button" class="tool-btn" on:click={() => (sidebarCollapsed = !sidebarCollapsed)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
          <span>Panel</span>
        </button>
      {/if}
    </footer>
  {/if}
</div>

<style>
  @import '$styles/layouts/tool-page.css';

  .phase-tabs {
    display: flex;
    gap: 2px;
    background: var(--color-border, #e5e7eb);
    border-radius: 6px;
    padding: 2px;
    width: 100%;
  }

  .panel-footer {
    padding: 0.75rem;
    background: var(--color-white, #fff);
    border-top: var(--border-thick, 2px solid #2b2520);
    flex-shrink: 0;
    display: flex;
    justify-content: center;
  }

  .phase-tab {
    flex: 1;
    padding: 0.35rem 0.6rem;
    font-size: 0.72rem;
    font-weight: 700;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--color-white, #fff);
    cursor: pointer;
    opacity: 0.5;
    transition: all 0.15s;
    white-space: nowrap;
    text-align: center;
  }

  .phase-tab.active {
    background: var(--color-white, #fff);
    color: var(--color-text, #111);
    opacity: 1;
    box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  }

  .bar-hint {
    font-size: 0.72rem;
    color: var(--color-text, #111);
    opacity: 0.45;
    padding: 0 0.5rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Bbox edit panel ─────────────────────────────────── */
  .bbox-panel {
    position: absolute;
    bottom: calc(var(--bottom-bar-height, 36px) + 8px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    background: var(--color-white, #fff);
    border: var(--border-thick, 2px solid #2b2520);
    border-radius: 6px;
    box-shadow: 4px 4px 0 var(--color-border, #2b2520);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.55rem 0.7rem;
    min-width: 320px;
    max-width: min(560px, calc(100vw - 2rem));
  }
  .bbox-panel-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .bbox-panel-cat-dot {
    width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
  }
  .bbox-panel-text {
    flex: 1; min-width: 0;
    font-family: var(--font-family-base); font-size: 0.82rem;
    border: 1px solid var(--color-border, #d1d5db); border-radius: 3px;
    padding: 0.3rem 0.5rem; background: var(--color-bg, #fafaf9);
  }
  .bbox-panel-text:focus { outline: 2px solid var(--color-blue, #3b82f6); outline-offset: -1px; background: #fff; }
  .bbox-panel-cat {
    font-family: var(--font-family-base); font-size: 0.75rem;
    border: 1px solid var(--color-border, #d1d5db); border-radius: 3px;
    padding: 0.3rem 0.35rem; background: var(--color-bg, #fafaf9);
    cursor: pointer; flex-shrink: 0;
  }
  .bbox-panel-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .bbox-panel-conf {
    font-size: 0.68rem; font-weight: 700;
    font-variant-numeric: tabular-nums;
    opacity: 0.45; margin-right: 0.2rem;
  }
  .bbox-panel-btn {
    display: inline-flex; align-items: center; gap: 0.3rem;
    font-family: var(--font-family-base); font-size: 0.72rem; font-weight: 700;
    padding: 0.28rem 0.65rem;
    border: var(--border-thin, 1.5px solid #111); border-radius: 4px;
    background: var(--color-bg, #fafaf9); color: var(--color-text, #111);
    cursor: pointer; transition: all 0.1s;
  }
  .bbox-panel-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .bbox-panel-btn.validate:hover, .bbox-panel-btn.validate.active {
    background: #dcfce7; color: #166534; border-color: #166534;
  }
  .bbox-panel-btn.reject:hover, .bbox-panel-btn.reject.active {
    background: #fee2e2; color: #b91c1c; border-color: #b91c1c;
  }
  .bbox-panel-close {
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; margin-left: auto;
    border: 1px solid var(--color-border, #d1d5db); border-radius: 3px;
    background: transparent; cursor: pointer; color: var(--color-text, #111); opacity: 0.4;
  }
  .bbox-panel-close:hover { opacity: 1; background: var(--color-gray-100, #f3f4f6); }
</style>
