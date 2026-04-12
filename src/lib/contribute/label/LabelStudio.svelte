<!--
  LabelStudio.svelte — Root component for collaborative map labeling.
  Separate OL instance (IIIF viewer, pixel coords), not using MapShell.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import "$styles/layouts/mode-shared.css";
  import { getSupabaseContext } from "$lib/supabase/context";
  import { annotationUrlForSource } from "$lib/shell/warpedOverlay";
  import {
    fetchLabelMaps,
    fetchMapPins,
    createPin,
    deletePin,
    updatePinPosition,
    fetchMapFootprints,
    createFootprint,
    updateFootprint,
    updateFootprintMeta,
    deleteFootprint,
  } from "$lib/supabase/labels";
  import type { LabelMapInfo } from "$lib/supabase/labels";
  import type { LabelPin, FootprintSubmission, PixelCoord, FeatureType } from "./types";

  import LabelCanvas from "./LabelCanvas.svelte";
  import LabelSidebar from "./LabelSidebar.svelte";
  import LabelProgress from "./LabelProgress.svelte";

  const { supabase, session } = getSupabaseContext();
  const userId = session?.user?.id;

  let maps: LabelMapInfo[] = [];
  let currentMapIndex = 0;
  let currentMap: LabelMapInfo | null = null;
  let pins: LabelPin[] = [];
  let myPins: LabelPin[] = [];
  let footprints: FootprintSubmission[] = [];
  let myFootprints: FootprintSubmission[] = [];
  let selectedLabel: string | null = null;
  let topMode: 'pin' | 'trace' = 'pin';
  let drawMode: 'pin' | 'trace' | 'select' | 'pin-edit' = 'pin';
  let geometryMode: 'Polygon' | 'LineString' = 'Polygon';
  /** Sub-tool within trace: 'polygon' | 'line' | 'edit' */
  let traceTool: 'polygon' | 'line' | 'edit' = 'polygon';
  /** Sub-tool within pin: 'place' | 'edit' */
  let pinTool: 'place' | 'edit' = 'place';

  function setTopMode(mode: 'pin' | 'trace') {
    topMode = mode;
    if (mode === 'pin') {
      pinTool = 'place';
      drawMode = 'pin';
    } else {
      traceTool = 'polygon';
      geometryMode = 'Polygon';
      drawMode = 'trace';
    }
  }

  function setPinTool(tool: 'place' | 'edit') {
    pinTool = tool;
    drawMode = tool === 'place' ? 'pin' : 'pin-edit';
  }

  function setTraceTool(tool: 'polygon' | 'line' | 'edit') {
    traceTool = tool;
    if (tool === 'edit') {
      drawMode = 'select';
    } else {
      drawMode = 'trace';
      geometryMode = tool === 'polygon' ? 'Polygon' : 'LineString';
    }
  }
  let loading = true;
  let iiifInfoUrl: string | null = null;
  let submitting = false;
  let submitMsg = "";
  let canvasRef: LabelCanvas;
  let newFootprintId: string | null = null;
  let sidebarCollapsed = false;
  let isMobile = false;
  let sidebarWidth = 340;
  let isResizing = false;

  $: mapDisplayName = currentMap?.name ?? `Map ${currentMapIndex + 1}`;

  function startResize(e: MouseEvent) {
    e.preventDefault();
    isResizing = true;
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      sidebarWidth = Math.max(260, Math.min(600, startW + ev.clientX - startX));
    };
    const onUp = () => {
      isResizing = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Transcription state (pin naming)
  let showTranscriptionModal = false;
  let pendingPinData: { pixelX: number; pixelY: number } | null = null;
  let transcriptionValue = "";
  let transcriptionLabel = "";

  function getNextName(): string {
    return `Shape ${myFootprints.length + 1}`;
  }

  // Legend from map's label_config, with defaults
  $: legendItems = currentMap?.legend?.length
    ? (currentMap.legend as any[])
    : ['Building', 'Temple', 'Market', 'School', 'Hospital',
       'Government', 'Residence', 'Bridge', 'Park', 'Unknown'];

  // Trace categories: from map's label_config, fall back to legend labels
  $: traceCategories = currentMap?.categories?.length
    ? currentMap.categories
    : legendItems.map((item: any) => typeof item === 'string' ? item : (item.label ?? item.val));

  $: myPins = userId ? pins.filter((p) => p.userId === userId) : [];
  $: myFootprints = userId ? footprints.filter((f) => f.userId === userId) : [];

  async function loadMaps() {
    loading = true;
    try {
      maps = await fetchLabelMaps(supabase);
      if (maps.length > 0) {
        currentMapIndex = 0;
        await selectMap(0);
      }
    } catch (err) {
      console.error("[LabelStudio] Failed to load maps:", err);
    } finally {
      loading = false;
    }
  }

  async function selectMap(index: number) {
    if (index < 0 || index >= maps.length) return;
    currentMapIndex = index;
    currentMap = maps[index];
    selectedLabel = null;
    iiifInfoUrl = null;
    pins = [];
    footprints = [];
    await Promise.all([loadMapPins(), loadMapFootprints(), resolveIiifUrl()]);
  }

  async function loadMapPins() {
    if (!currentMap) return;
    pins = await fetchMapPins(supabase, currentMap.id);
  }

  async function loadMapFootprints() {
    if (!currentMap) return;
    try {
      footprints = await fetchMapFootprints(supabase, currentMap.id);
    } catch (err) {
      console.error('[LabelStudio] Failed to load footprints:', err);
      footprints = [];
    }
  }

  async function resolveIiifUrl() {
    if (!currentMap?.allmapsId) return;
    try {
      const res = await fetch(annotationUrlForSource(currentMap.allmapsId));
      if (!res.ok) throw new Error(`Allmaps fetch failed: ${res.status}`);
      const annotation = await res.json();
      const items = annotation.items;
      if (!items?.length) throw new Error("No items in annotation");
      const sourceId = items[0]?.target?.source?.id;
      if (!sourceId) throw new Error("No source ID in annotation");
      iiifInfoUrl = `${sourceId}/info.json`;
    } catch (err) {
      console.error("[LabelStudio] Failed to resolve IIIF URL:", err);
      iiifInfoUrl = null;
    }
  }

  function handleSelectLabel(event: CustomEvent<{ label: string }>) {
    selectedLabel = event.detail.label;
  }

  async function handlePlacePin(
    event: CustomEvent<{ pixelX: number; pixelY: number }>,
  ) {
    if (!currentMap || !userId || !selectedLabel) return;

    // Check if this is a list item (object legend)
    const legendItem = legendItems.find(
      (i) => (typeof i === "string" ? i : i.val) === selectedLabel,
    );
    if (typeof legendItem === "object") {
      // Open transcription modal
      pendingPinData = event.detail;
      transcriptionLabel = legendItem.label; // "Abattoir Municipal"
      transcriptionValue = "";
      showTranscriptionModal = true;
      // Focus input next tick (handled by action or simplistic timeout)
      setTimeout(
        () => document.getElementById("transcription-input")?.focus(),
        100,
      );
      return;
    }

    // Direct create for simple tags
    await createAndAddPin(event.detail.pixelX, event.detail.pixelY);
  }

  async function confirmTranscription() {
    if (!pendingPinData) return;
    await createAndAddPin(pendingPinData.pixelX, pendingPinData.pixelY, {
      vietnameseName: transcriptionValue,
      originalName: transcriptionLabel,
    });
    closeTranscriptionModal();
  }

  function closeTranscriptionModal() {
    showTranscriptionModal = false;
    pendingPinData = null;
    transcriptionValue = "";
  }

  async function createAndAddPin(pixelX: number, pixelY: number, data?: any) {
    if (!currentMap || !userId || !selectedLabel) return;
    const id = await createPin(supabase, {
      mapId: currentMap.id,
      userId,
      label: selectedLabel,
      pixelX,
      pixelY,
      data,
    });
    if (id) {
      pins = [...pins, { id, mapId: currentMap.id, userId, label: selectedLabel, pixelX, pixelY, data }];
    }
  }

  async function handleRemovePin(event: CustomEvent<{ pinId: string }>) {
    const success = await deletePin(supabase, event.detail.pinId);
    if (success) {
      pins = pins.filter((p) => p.id !== event.detail.pinId);
    }
  }

  async function handleMovePin(event: CustomEvent<{ pinId: string; pixelX: number; pixelY: number }>) {
    const { pinId, pixelX, pixelY } = event.detail;
    const ok = await updatePinPosition(supabase, pinId, pixelX, pixelY);
    if (ok) {
      pins = pins.map((p) => p.id === pinId ? { ...p, pixelX, pixelY } : p);
    }
  }

  async function handleDrawPolygon(event: CustomEvent<{ pixelPolygon: PixelCoord[] }>) {
    if (!currentMap || !userId) return;
    const name = getNextName();
    const cat = selectedLabel ?? null;
    const id = await createFootprint(supabase, {
      mapId: currentMap.id, userId,
      pixelPolygon: event.detail.pixelPolygon,
      name, category: cat, featureType: 'other',
    });
    if (id) {
      footprints = [...footprints, {
        id, mapId: currentMap.id, userId,
        pixelPolygon: event.detail.pixelPolygon, name, category: cat, featureType: 'other', status: 'submitted',
      }];
      newFootprintId = id;
      setTimeout(() => { newFootprintId = null; }, 150);
    }
  }

  async function handleRemoveFootprint(event: CustomEvent<{ footprintId: string }>) {
    const success = await deleteFootprint(supabase, event.detail.footprintId);
    if (success) {
      footprints = footprints.filter((f) => f.id !== event.detail.footprintId);
    }
  }

  async function handleModifyFootprint(
    event: CustomEvent<{ footprintId: string; pixelPolygon: PixelCoord[] }>
  ) {
    const { footprintId, pixelPolygon } = event.detail;
    const ok = await updateFootprint(supabase, footprintId, pixelPolygon);
    if (ok) {
      footprints = footprints.map((f) =>
        f.id === footprintId ? { ...f, pixelPolygon } : f
      );
    }
  }

  async function handleUpdateFootprintMeta(
    event: CustomEvent<{ footprintId: string; name?: string; featureType?: FeatureType; category?: string | null }>
  ) {
    const { footprintId, name, featureType: ft, category } = event.detail;
    const ok = await updateFootprintMeta(supabase, footprintId, {
      name: name ?? undefined,
      featureType: ft ?? undefined,
      category: category !== undefined ? category : undefined,
    });
    if (ok) {
      footprints = footprints.map((f) =>
        f.id === footprintId
          ? {
              ...f,
              ...(name !== undefined ? { name } : {}),
              ...(ft ? { featureType: ft } : {}),
              ...(category !== undefined ? { category } : {}),
            }
          : f
      );
    }
  }

  function handleZoomToFootprint(event: CustomEvent<{ footprintId: string }>) {
    canvasRef?.zoomToFootprint(event.detail.footprintId);
  }

  async function handleSubmit() {
    if (!currentMap || !userId) return;
    submitting = true;
    submitMsg = "";
    try {
      const parts = [];
      if (myFootprints.length) parts.push(`${myFootprints.length} shape${myFootprints.length !== 1 ? 's' : ''}`);
      if (myPins.length) parts.push(`${myPins.length} pin${myPins.length !== 1 ? 's' : ''}`);
      submitMsg = parts.length ? `Saved ${parts.join(' + ')}!` : 'Nothing to submit yet.';
      // Auto-advance after a short delay
      setTimeout(() => {
        submitMsg = "";
        if (currentMapIndex < maps.length - 1) {
          selectMap(currentMapIndex + 1);
        }
      }, 1500);
    } catch (err) {
      console.error("[LabelStudio] Submit failed:", err);
      submitMsg = "Submit failed. Try again.";
    } finally {
      submitting = false;
    }
  }

  function handleSkip() {
    if (currentMapIndex < maps.length - 1) {
      selectMap(currentMapIndex + 1);
    }
  }

  onMount(() => {
    loadMaps();
    const mql = window.matchMedia("(max-width: 900px)");
    isMobile = mql.matches;
    const handler = (e: MediaQueryListEvent) => { isMobile = e.matches; };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  });
</script>

<div class="label-studio" class:mobile={isMobile}>
  {#if loading}
    <div class="loading">Loading maps...</div>
  {:else if !currentMap}
    <div class="empty">
      <h2>No Maps Available</h2>
      <p>There are no maps ready for labeling at this time. Check back later.</p>
    </div>
  {:else}
    <!-- ── Top bar: map selector ── -->
    <header class="top-bar">
      <a href="/" class="home-link" title="Back to home">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 6l6-4.5L14 6v7.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 13.5V6z"/>
          <path d="M6 15V9h4v6"/>
        </svg>
      </a>

      {#if maps.length > 1}
        <div class="map-tabs">
          {#each maps as map, i (map.id)}
            <button type="button" class="map-tab" class:active={i === currentMapIndex} on:click={() => selectMap(i)} title={map.name ?? `Map ${i + 1}`}>
              {map.name ?? `Map ${i + 1}`}
            </button>
          {/each}
        </div>
      {:else}
        <h1 class="map-title-bar">{mapDisplayName}</h1>
      {/if}

      <div class="top-bar-stats">
        <span class="stat-count">{myPins.length + myFootprints.length}</span>
      </div>
    </header>

    <div
      class="workspace"
      class:with-sidebar={!sidebarCollapsed && !isMobile}
      class:resizing={isResizing}
      style={!sidebarCollapsed && !isMobile ? `--sidebar-width: ${sidebarWidth}px` : ''}
    >
      <!-- ── Left panel (sidebar) ── -->
      {#if !sidebarCollapsed && !isMobile}
        <aside class="panel">
          <LabelSidebar
            {legendItems}
            {traceCategories}
            {selectedLabel}
            drawMode={topMode}
            placedPins={myPins}
            placedFootprints={myFootprints}
            {newFootprintId}
            on:selectLabel={handleSelectLabel}
            on:removePin={handleRemovePin}
            on:removeFootprint={handleRemoveFootprint}
            on:updateFootprintMeta={handleUpdateFootprintMeta}
            on:zoomToFootprint={handleZoomToFootprint}
            on:submit={handleSubmit}
          />

          {#if submitMsg}
            <div class="submit-msg" class:error={submitMsg.includes("failed")}>
              {submitMsg}
            </div>
          {/if}
        </aside>
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="resize-handle" on:mousedown={startResize}></div>
      {/if}

      <!-- ── Canvas (map-stage) ── -->
      <div class="map-stage">
        {#if sidebarCollapsed && !isMobile}
          <div class="top-controls">
            <button type="button" class="ctrl-btn" on:click={() => (sidebarCollapsed = false)} title="Show panel">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" />
              </svg>
            </button>
          </div>
        {/if}

        <LabelCanvas
          bind:this={canvasRef}
          {iiifInfoUrl}
          {legendItems}
          {pins}
          {footprints}
          mapId={currentMap?.id ?? null}
          myUserId={userId ?? null}
          placingEnabled={drawMode === 'pin' ? !!selectedLabel : drawMode === 'trace'}
          {selectedLabel}
          {drawMode}
          {geometryMode}
          on:placePin={handlePlacePin}
          on:movePin={handleMovePin}
          on:removePin={handleRemovePin}
          on:drawPolygon={handleDrawPolygon}
          on:removeFootprint={handleRemoveFootprint}
          on:modifyFootprint={handleModifyFootprint}
        />

        <!-- Floating controls (mobile menu) -->
        {#if isMobile}
          <div class="floating-controls">
            <button type="button" class="ctrl-btn" on:click={() => (sidebarCollapsed = !sidebarCollapsed)} title="Toggle panel">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- ── Bottom toolbar ── -->
    <footer class="bottom-bar">
      <!-- Primary mode tabs -->
      <button class="tool-btn primary" class:active={topMode === 'pin'} on:click={() => setTopMode('pin')} title="Pin mode">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
        <span>Pin</span>
      </button>
      <button class="tool-btn primary" class:active={topMode === 'trace'} on:click={() => setTopMode('trace')} title="Trace mode">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/></svg>
        <span>Trace</span>
      </button>

      <div class="type-separator"></div>

      <!-- Sub-tools for Pin -->
      {#if topMode === 'pin'}
        <button class="type-btn" class:active={pinTool === 'place'} on:click={() => setPinTool('place')} title="Place pins">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          <span class="type-label">Place</span>
        </button>
        <button class="type-btn" class:active={pinTool === 'edit'} on:click={() => setPinTool('edit')} title="Move and edit pins">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l3.057-3L20.5 12.5 8.057 25 5 22"/><path d="M14 14l7-7"/></svg>
          <span class="type-label">Edit</span>
        </button>
      {/if}

      <!-- Sub-tools for Trace -->
      {#if topMode === 'trace'}
        <button class="type-btn" class:active={traceTool === 'polygon'} on:click={() => setTraceTool('polygon')} title="Draw polygon (closed area)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/></svg>
          <span class="type-label">Polygon</span>
        </button>
        <button class="type-btn" class:active={traceTool === 'line'} on:click={() => setTraceTool('line')} title="Draw line (road, waterway)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 19 8 10 14 14 20 5"/></svg>
          <span class="type-label">Line</span>
        </button>
        <button class="type-btn" class:active={traceTool === 'edit'} on:click={() => setTraceTool('edit')} title="Select and edit shapes">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          <span class="type-label">Edit</span>
        </button>
      {/if}

      <div class="tool-divider"></div>

      <button class="tool-btn submit-tool" on:click={handleSubmit} disabled={myPins.length === 0 && myFootprints.length === 0} title="Submit and go to next task">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Done</span>
      </button>

      {#if maps.length > 1}
        <button class="tool-btn skip-tool" on:click={handleSkip} disabled={currentMapIndex >= maps.length - 1} title="Skip to next map">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
          <span>Skip</span>
        </button>
      {/if}
    </footer>

    <!-- Mobile sidebar (sliding panel) -->
    {#if isMobile && !sidebarCollapsed}
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div class="mobile-overlay" on:click={() => (sidebarCollapsed = true)}></div>
      <div class="mobile-sidebar">
        <aside class="panel">
          <div class="panel-header">
            <h3 class="panel-title">{mapDisplayName}</h3>
            <button type="button" class="panel-close" on:click={() => (sidebarCollapsed = true)} aria-label="Close panel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <LabelSidebar
            {legendItems}
            {traceCategories}
            {selectedLabel}
            drawMode={topMode}
            placedPins={myPins}
            placedFootprints={myFootprints}
            {newFootprintId}
            on:selectLabel={handleSelectLabel}
            on:removePin={handleRemovePin}
            on:removeFootprint={handleRemoveFootprint}
            on:updateFootprintMeta={handleUpdateFootprintMeta}
            on:zoomToFootprint={handleZoomToFootprint}
            on:submit={handleSubmit}
          />
        </aside>
      </div>
    {/if}
  {/if}

  {#if showTranscriptionModal}
    <div class="modal-backdrop">
      <div class="modal">
        <h3 class="modal-title">Transcription</h3>
        <div class="modal-body">
          <p class="modal-label">
            Original: <strong>{transcriptionLabel}</strong>
          </p>
          <label>
            Vietnamese Name / Details
            <input
              id="transcription-input"
              type="text"
              bind:value={transcriptionValue}
              class="modal-input"
              placeholder="e.g. Lò mổ thành phố"
              on:keydown={(e) => e.key === "Enter" && confirmTranscription()}
            />
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" on:click={closeTranscriptionModal}>Cancel</button>
          <button class="btn-confirm" on:click={confirmTranscription}>Confirm</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
/* ── Shell ── */
.label-studio {
    position: relative;
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background-color: var(--color-bg);
    overflow: hidden;
}

.label-studio .map-stage {
    background: var(--color-white);
    border-radius: 0;
    border: none;
    box-shadow: none;
    flex: 1;
    min-width: 0;
    position: relative;
}

.label-studio .workspace {
    flex: 1;
    min-height: 0;
    display: flex;
    position: relative;
}

.label-studio .workspace.with-sidebar {
    /* override mode-shared grid — use flex instead for drag-resize */
    display: flex;
    grid-template-columns: unset;
    gap: 0;
    padding: 0;
}

.label-studio.mobile .workspace {
    padding: 0;
    gap: 0;
}

/* ── Top bar ── */
.top-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 1rem;
    height: 48px;
    background: var(--color-white);
    border-bottom: var(--border-thick);
    flex-shrink: 0;
    z-index: 10;
}

.home-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    color: var(--color-text);
    text-decoration: none;
    opacity: 0.6;
    transition: all 0.1s;
    flex-shrink: 0;
}

.home-link:hover {
    opacity: 1;
    background: var(--color-gray-100);
}

.map-title-bar {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: 0.95rem;
    font-weight: 800;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.map-tabs {
    display: flex;
    gap: 0.25rem;
    overflow-x: auto;
    flex: 1;
    min-width: 0;
    scrollbar-width: none;
}

.map-tabs::-webkit-scrollbar {
    display: none;
}

.map-tab {
    padding: 0.3rem 0.7rem;
    border: var(--border-thin);
    border-radius: var(--radius-pill);
    background: var(--color-bg);
    color: var(--color-text);
    font-family: var(--font-family-base);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.1s;
    white-space: nowrap;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
}

.map-tab:hover {
    background: var(--color-yellow);
}

.map-tab.active {
    background: var(--color-blue);
    color: white;
    border-color: var(--color-blue);
}

.top-bar-stats {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    margin-left: auto;
}

.stat-count {
    font-family: var(--font-family-base);
    font-size: 0.8rem;
    font-weight: 800;
    color: var(--color-text);
    opacity: 0.6;
}

/* ── Panel (sidebar) ── */
.panel {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    border-right: var(--border-thick);
    height: 100%;
    overflow: hidden;
    width: var(--sidebar-width, 340px);
    flex-shrink: 0;
    color: var(--color-text);
}

/* ── Resize handle ── */
.resize-handle {
    width: 5px;
    cursor: col-resize;
    background: transparent;
    flex-shrink: 0;
    position: relative;
    z-index: 5;
    transition: background 0.15s;
}

.resize-handle:hover,
.resizing .resize-handle {
    background: var(--color-blue);
}

.resizing {
    user-select: none;
    cursor: col-resize;
}

.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: var(--border-thick);
    background: var(--color-white);
}

.panel-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: var(--border-thin);
    border-radius: 50%;
    background: var(--color-white);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.1s;
    box-shadow: 1px 1px 0px var(--color-border);
}

.panel-close:hover {
    background: var(--color-yellow);
    transform: translate(-1px, -1px);
    box-shadow: 2px 2px 0px var(--color-border);
}

.panel-title {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: 1rem;
    font-weight: 800;
}

/* ── Bottom toolbar ── */
.bottom-bar {
    display: flex;
    align-items: center;
    gap: 0;
    height: 48px;
    background: var(--color-white);
    border-top: var(--border-thick);
    flex-shrink: 0;
    z-index: 10;
}

.tool-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0 1rem;
    height: 100%;
    font-family: var(--font-family-base);
    font-size: 0.8rem;
    font-weight: 700;
    border: none;
    border-right: var(--border-thin);
    background: var(--color-white);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.1s;
    opacity: 0.55;
}

.tool-btn:hover {
    background: var(--color-gray-100);
    opacity: 0.8;
}

.tool-btn.active {
    background: var(--color-yellow);
    opacity: 1;
}

.tool-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}

.tool-btn.primary {
    font-size: 0.85rem;
    opacity: 0.5;
}

.tool-btn.primary.active {
    opacity: 1;
    background: var(--color-yellow);
    font-weight: 800;
}

.tool-divider {
    flex: 1;
    border-right: none;
}

.tool-btn.submit-tool {
    border-right: var(--border-thin);
    border-left: var(--border-thin);
    color: #16a34a;
    opacity: 0.8;
}

.tool-btn.submit-tool:hover:not(:disabled) {
    background: #dcfce7;
    opacity: 1;
}

.tool-btn.skip-tool {
    opacity: 0.5;
    border-right: none;
}

.tool-btn.skip-tool:hover:not(:disabled) {
    background: var(--color-gray-100);
    opacity: 0.8;
}

/* ── Feature type buttons (in bottom bar) ── */
.type-separator {
    width: 1px;
    height: 28px;
    background: var(--color-border);
    margin: 0 0.25rem;
    flex-shrink: 0;
}

.type-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3rem 0.6rem;
    height: 32px;
    font-family: var(--font-family-base);
    font-size: 0.7rem;
    font-weight: 700;
    border: var(--border-thin);
    border-radius: var(--radius-pill);
    background: var(--color-bg);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.1s;
    opacity: 0.6;
    white-space: nowrap;
    flex-shrink: 0;
}

.type-btn:hover {
    opacity: 0.9;
    background: var(--color-gray-100);
}

.type-btn.active {
    background: var(--color-yellow);
    border-color: var(--color-border);
    opacity: 1;
}

.type-label {
    font-size: 0.7rem;
}

@media (max-width: 900px) {
    .type-label {
        display: none;
    }

    .type-btn {
        padding: 0.3rem 0.45rem;
    }
}

/* ── Loading / empty ── */
.loading,
.empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text);
    font-size: 1rem;
    opacity: 0.8;
}

.empty h2 {
    margin: 0 0 0.5rem;
    font-family: var(--font-family-display);
    font-size: 1.5rem;
    font-weight: 800;
}

.empty p {
    margin: 0;
}

/* ── Submit message ── */
.submit-msg {
    padding: 0.75rem 1rem;
    font-size: 0.85rem;
    font-weight: 700;
    color: #16a34a;
    background: #dcfce7;
    text-align: center;
    border-top: var(--border-thin);
}

.submit-msg.error {
    color: #b91c1c;
    background: #fee2e2;
}

/* ── Modal ── */
.modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal {
    background: var(--color-white);
    padding: 2rem;
    border-radius: var(--radius-lg);
    width: 90%;
    max-width: 450px;
    border: var(--border-thick);
    box-shadow: var(--shadow-solid);
}

.modal-title {
    font-family: var(--font-family-display);
    margin: 0 0 1rem;
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--color-text);
    text-transform: uppercase;
}

.modal-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 2rem;
}

.modal-label strong {
    display: block;
    font-size: 1.1rem;
    color: var(--color-text);
    margin-top: 0.25rem;
}

.modal-input {
    width: 100%;
    padding: 0.75rem;
    font-family: var(--font-family-base);
    border: var(--border-thick);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    margin-top: 0.5rem;
    box-sizing: border-box;
    font-size: 1rem;
}

.modal-input:focus {
    outline: none;
    background: var(--color-white);
    box-shadow: 4px 4px 0px var(--color-border);
    transform: translate(-2px, -2px);
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
}

.btn-cancel {
    background: transparent;
    border: var(--border-thin);
    border-radius: var(--radius-pill);
    padding: 0.6rem 1.2rem;
    cursor: pointer;
    font-weight: 700;
    color: var(--color-text);
}

.btn-cancel:hover {
    background: var(--color-gray-100);
}

.btn-confirm {
    background: var(--color-blue);
    color: white;
    border: var(--border-thick);
    border-radius: var(--radius-pill);
    padding: 0.6rem 1.5rem;
    cursor: pointer;
    font-weight: 700;
    box-shadow: 2px 2px 0px var(--color-border);
}

.btn-confirm:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0px var(--color-border);
}
</style>