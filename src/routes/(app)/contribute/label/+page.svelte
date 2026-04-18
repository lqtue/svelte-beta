<!--
  /contribute/label — OCR bbox review tool.

  Shows IIIF map canvas (ImageShell) with OCR extraction bounding boxes
  rendered as colored rectangles (OcrBboxTool). Sidebar (OcrSidebar) lists
  extractions with inline text/category editing and validate/reject actions.

  Flow:
    • Click bbox → selects it, highlights sidebar row, focuses text input
    • Drag bbox → repositions it, PATCHes new global_x/y to DB
    • Edit text in sidebar → validate/reject
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
  import type { OcrExtraction } from '$lib/contribute/ocr/types';
  import { getSupabaseContext } from '$lib/supabase/context';
  import { annotationUrlForSource } from '$lib/shell/warpedOverlay';
  import { fetchLabelMaps } from '$lib/supabase/labels';
  import type { LabelMapInfo } from '$lib/supabase/labels';

  const { supabase } = getSupabaseContext();

  // ── Map selection ──────────────────────────────────────────────────────────
  let maps: LabelMapInfo[] = [];
  let currentMap: LabelMapInfo | null = null;
  let iiifInfoUrl: string | null = null;

  // ── OCR state ──────────────────────────────────────────────────────────────
  let ocrSidebar: OcrSidebar;
  let ocrExtractions: OcrExtraction[] = [];
  let visibleExtractionIds = new Set<string>();
  let selectedExtractionId: string | null = null;
  let isolationMode = false;
  let map: OlMap | null = null;

  // ── Layout ─────────────────────────────────────────────────────────────────
  let sidebarCollapsed = false;
  let isMobile = false;
  let isCompact = false;

  // ── Scaling logic ─────────────────────────────────────────────────────────
  let imgWidth = 0;
  let imgHeight = 0;
  let nativeW = 0;
  let nativeH = 0;

  $: displayExtractions = (() => {
    // Determine native bounds from the full ocrExtractions list
    const ocrW = ocrExtractions.length ? Math.max(...ocrExtractions.map(e => (e.tile_x ?? 0) + (e.tile_w ?? 0))) : 0;
    const ocrH = ocrExtractions.length ? Math.max(...ocrExtractions.map(e => (e.tile_y ?? 0) + (e.tile_h ?? 0))) : 0;

    if (!imgWidth || !imgHeight || !ocrW || !ocrH) return ocrExtractions;
    
    const scaleX = imgWidth / ocrW;
    const scaleY = imgHeight / ocrH;

    return ocrExtractions.map(ext => ({
      ...ext,
      global_x: ext.global_x * scaleX,
      global_y: ext.global_y * scaleY,
      global_w: ext.global_w * scaleX,
      global_h: ext.global_h * scaleY
    }));
  })();

  // ── Map loading ────────────────────────────────────────────────────────────
  async function loadMaps() {
    try { maps = await fetchLabelMaps(supabase); }
    catch (err) { console.error('[LabelPage] Failed to load maps:', err); }
  }

  async function selectMap(map: LabelMapInfo) {
    if (currentMap?.id === map.id) return;
    currentMap = map;
    iiifInfoUrl = null;
    ocrExtractions = [];
    selectedExtractionId = null;
    nativeW = 0;
    nativeH = 0;
    await resolveIiifUrl();
  }

  async function resolveIiifUrl() {
    if (!currentMap?.allmapsId) return;
    try {
      const res = await fetch(annotationUrlForSource(currentMap.allmapsId));
      if (!res.ok) throw new Error(`Allmaps fetch failed: ${res.status}`);
      const annotation = await res.json();
      const sourceId = annotation.items?.[0]?.target?.source?.id;
      if (!sourceId) throw new Error('No source ID in annotation');
      iiifInfoUrl = `${sourceId}/info.json`;
    } catch (err) {
      console.error('[LabelPage] Failed to resolve IIIF URL:', err);
      iiifInfoUrl = null;
    }
  }

  // ── OCR handlers ──────────────────────────────────────────────────────────
  function handleLoaded(e: CustomEvent<{ extractions: OcrExtraction[] }>) {
    ocrExtractions = e.detail.extractions;
    selectedExtractionId = null;
  }

  function handleSelect(e: CustomEvent<{ id: string }>) {
    selectedExtractionId = e.detail.id;
    ocrSidebar?.focusRow(e.detail.id);
  }

  function handleFilter(e: CustomEvent<{ extractions: OcrExtraction[] }>) {
    visibleExtractionIds = new Set(e.detail.extractions.map(ex => ex.id));
  }

  function handleZoomToExtraction(e: CustomEvent<{ globalX: number; globalY: number; globalW: number; globalH: number }>) {
    if (!map || !imgWidth || !imgHeight) return;

    // OCR source dimensions
    const ocrW = Math.max(...ocrExtractions.map(ex => (ex.tile_x ?? 0) + (ex.tile_w ?? 0)));
    const ocrH = Math.max(...ocrExtractions.map(ex => (ex.tile_y ?? 0) + (ex.tile_h ?? 0)));
    if (ocrW <= 0 || ocrH <= 0) return;

    const scaleX = imgWidth / ocrW;
    const scaleY = imgHeight / ocrH;

    const { globalX, globalY, globalW, globalH } = e.detail;
    const dx = globalX * scaleX;
    const dy = globalY * scaleY;
    const dw = globalW * scaleX;
    const dh = globalH * scaleY;

    // OL extent: [minX, minY, maxX, maxY] where minY is the bottom of the image in y-flipped space
    // image_y maps to -display_y
    // bottom edge is -(dy + dh), top edge is -dy
    map.getView().fit([dx, -(dy + dh), dx + dw, -dy], {
      padding: [100, 100, 100, 100],
      duration: 400
    });
  }

  async function handleMove(e: CustomEvent<{ id: string; global_x: number; global_y: number; global_w: number; global_h: number }>) {
    const ocrW = ocrExtractions.length ? Math.max(...ocrExtractions.map(e => (e.tile_x ?? 0) + (e.tile_w ?? 0))) : 0;
    const ocrH = ocrExtractions.length ? Math.max(...ocrExtractions.map(e => (e.tile_y ?? 0) + (e.tile_h ?? 0))) : 0;

    if (!currentMap || !imgWidth || !imgHeight || !ocrW || !ocrH) return;
    const { id, global_x: dx, global_y: dy, global_w: dw, global_h: dh } = e.detail;

    const scaleX = imgWidth / ocrW;
    const scaleY = imgHeight / ocrH;

    const native = {
      global_x: dx / scaleX,
      global_y: dy / scaleY,
      global_w: dw / scaleX,
      global_h: dh / scaleY
    };

    // Optimistic update in local array so OcrBboxTool re-draws at new position
    ocrExtractions = ocrExtractions.map(ext =>
      ext.id === id ? { ...ext, ...native } : ext
    );
    await fetch(`/api/admin/maps/${currentMap.id}/ocr-review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...native }),
    });
  }

  onMount(loadMaps);
</script>

<svelte:head>
  <title>{currentMap ? `${currentMap.name} — OCR Review` : 'OCR Review'} — Vietnam Map Archive</title>
  <meta name="description" content="Review and validate OCR extractions from historical maps." />
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
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.5 15L7.5 10L12.5 5"/>
            </svg>
            Contribute
          </a>
          <div class="panel-mode-label">OCR Review</div>
          <button
            type="button"
            class="collapse-btn"
            on:click={() => (sidebarCollapsed = true)}
            aria-label="Collapse sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M15 3H5a2 2 0 00-2 2v14a2 2 0 002 2h10"/><path d="M19 8l-4 4 4 4"/>
            </svg>
          </button>
        </div>
        {#if !currentMap}
          <div class="panel-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
              <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h5M7 13h8M7 17h4"/>
            </svg>
            <p>Select a map to review OCR extractions.</p>
          </div>
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
      </aside>
    </svelte:fragment>

    <!-- Floating map search -->
    <MapSearchBar
      maps={maps as any}
      selectedMapId={currentMap?.id ?? null}
      mapsOnly={true}
      on:selectMap={(e) => selectMap(e.detail.map as any)}
    />

    <!-- Image stage -->
    {#if currentMap && iiifInfoUrl}
      <ImageShell {iiifInfoUrl} bind:imgWidth bind:imgHeight bind:map>
        <OcrBboxTool
          extractions={displayExtractions}
          selectedId={selectedExtractionId}
          filteredIds={visibleExtractionIds}
          {isolationMode}
          on:select={handleSelect}
          on:move={handleMove}
        />
      </ImageShell>
    {:else if !currentMap}
      <div class="empty-stage">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.25">
          <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h5M7 13h8M7 17h4"/>
        </svg>
        <p>Select a map to begin OCR review.</p>
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
          <a href="/contribute" class="home-link" aria-label="Back to Contribute">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.5 15L7.5 10L12.5 5"/>
            </svg>
            Contribute
          </a>
          <div class="panel-mode-label">{currentMap?.name ?? 'OCR Review'}</div>
          <button type="button" class="collapse-btn" on:click={() => (sidebarCollapsed = true)} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {#if currentMap}
          <OcrSidebar
            mapId={currentMap.id}
            selectedId={selectedExtractionId}
            on:loaded={handleLoaded}
          />
        {:else}
          <div class="panel-empty">Select a map first.</div>
        {/if}
      </aside>
    </svelte:fragment>
  </ToolLayout>

  <!-- Bottom bar: sidebar toggle and isolation mode -->
  {#if currentMap}
    <footer class="bottom-bar">
      <div class="bar-hint">Click bbox to edit · drag to reposition</div>
      <div class="bar-divider"></div>

      <button
        type="button"
        class="tool-btn"
        class:active={isolationMode}
        on:click={() => (isolationMode = !isolationMode)}
        title={isolationMode ? 'Turn off focus mode' : 'Turn on focus mode (hide others)'}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="3"/><path d="M3 12c0 1 2 5 9 5s9-4 9-5-2-5-9-5-9 4-9 5z"/>
        </svg>
        <span>{isolationMode ? 'Focus On' : 'Focus'}</span>
      </button>

      <div class="bar-divider"></div>
      {#if !isMobile}
        <button
          type="button"
          class="tool-btn"
          on:click={() => (sidebarCollapsed = !sidebarCollapsed)}
          title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
          </svg>
          <span>{sidebarCollapsed ? 'Panel' : 'Hide'}</span>
        </button>
      {:else}
        <button
          type="button"
          class="tool-btn"
          on:click={() => (sidebarCollapsed = !sidebarCollapsed)}
          title="Toggle panel"
        >
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

  .bar-hint {
    font-size: 0.72rem;
    color: var(--color-text);
    opacity: 0.45;
    padding: 0 0.5rem;
    white-space: nowrap;
  }
</style>
