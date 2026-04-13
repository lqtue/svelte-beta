<!--
  /contribute/trace — Polygon + line tracing tool for map footprints.

  Uses:
    ToolLayout (responsive sidebar + map stage)
    ImageShell  (IIIF OL viewer in pixel coords)
    TraceTool   (OL Draw + Select + Modify interactions)
    TraceSidebar (shapes table with filtering, type/category editing)

  Map selection: user searches via SearchPanel → map selected → IIIF URL resolved.
  Task data (categories, footprints) fetched from label_tasks / footprint_submissions
  after a map is selected — same data model as LabelStudio, new map-selection UX.

  DrawMode toolbar (bottom bar, outside ToolLayout):
    ● Polygon — Draw closed polygon
    ● Line    — Draw open LineString (road, waterway)
    ● Edit    — Select + Modify existing footprints
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import ToolLayout from '$lib/shell/ToolLayout.svelte';
  import ImageShell from '$lib/shell/ImageShell.svelte';
  import TraceTool from '$lib/contribute/trace/TraceTool.svelte';
  import TraceSidebar from '$lib/contribute/trace/TraceSidebar.svelte';
  import { getSupabaseContext } from '$lib/supabase/context';
  import { annotationUrlForSource } from '$lib/shell/warpedOverlay';
  import {
    fetchLabelMaps,
    fetchMapFootprints,
    createFootprint,
    updateFootprint,
    updateFootprintMeta,
    deleteFootprint,
  } from '$lib/supabase/labels';
  import type { LabelMapInfo } from '$lib/supabase/labels';
  import type { FootprintSubmission, PixelCoord, FeatureType } from '$lib/contribute/label/types';

  const { supabase, session } = getSupabaseContext();
  const userId = session?.user?.id ?? null;

  // ── Map selection state ────────────────────────────────────────────────────
  let maps: LabelMapInfo[] = [];
  let currentMap: LabelMapInfo | null = null;
  let iiifInfoUrl: string | null = null;
  let loading = true;
  let searchQuery = '';
  let mapSearchOpen = false;

  // ── Trace data ─────────────────────────────────────────────────────────────
  let footprints: FootprintSubmission[] = [];
  let myFootprints: FootprintSubmission[] = [];
  let newFootprintId: string | null = null;

  // ── Tool mode ──────────────────────────────────────────────────────────────
  let traceTool: 'polygon' | 'line' | 'edit' = 'polygon';
  $: drawMode = (traceTool === 'edit' ? 'select' : 'trace') as 'trace' | 'select';
  $: geometryMode = (traceTool === 'line' ? 'LineString' : 'Polygon') as 'Polygon' | 'LineString';

  // ── Layout ─────────────────────────────────────────────────────────────────
  let sidebarCollapsed = false;
  let isMobile = false;
  let isCompact = false;

  // ── Derived ────────────────────────────────────────────────────────────────
  $: myFootprints = userId ? footprints.filter((f) => f.userId === userId) : [];
  $: traceCategories = currentMap?.categories?.length
    ? currentMap.categories
    : [];

  $: filteredMaps = searchQuery.trim()
    ? maps.filter((m) => m.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : maps;

  function getNextShapeName(): string {
    return `Shape ${myFootprints.length + 1}`;
  }

  // ── Load all traceable maps ────────────────────────────────────────────────
  async function loadMaps() {
    loading = true;
    try {
      maps = await fetchLabelMaps(supabase);
    } catch (err) {
      console.error('[TracePage] Failed to load maps:', err);
    } finally {
      loading = false;
    }
  }

  // ── Select a map ──────────────────────────────────────────────────────────
  async function selectMap(map: LabelMapInfo) {
    if (currentMap?.id === map.id) { mapSearchOpen = false; return; }
    currentMap = map;
    iiifInfoUrl = null;
    footprints = [];
    mapSearchOpen = false;
    searchQuery = '';
    await Promise.all([resolveIiifUrl(), loadFootprints()]);
  }

  async function resolveIiifUrl() {
    if (!currentMap?.allmapsId) return;
    try {
      const res = await fetch(annotationUrlForSource(currentMap.allmapsId));
      if (!res.ok) throw new Error(`Allmaps fetch failed: ${res.status}`);
      const annotation = await res.json();
      const items = annotation.items;
      if (!items?.length) throw new Error('No items in annotation');
      const sourceId = items[0]?.target?.source?.id;
      if (!sourceId) throw new Error('No source ID in annotation');
      iiifInfoUrl = `${sourceId}/info.json`;
    } catch (err) {
      console.error('[TracePage] Failed to resolve IIIF URL:', err);
      iiifInfoUrl = null;
    }
  }

  async function loadFootprints() {
    if (!currentMap) return;
    try {
      footprints = await fetchMapFootprints(supabase, currentMap.id);
    } catch (err) {
      console.error('[TracePage] Failed to load footprints:', err);
      footprints = [];
    }
  }

  // ── Draw handlers ─────────────────────────────────────────────────────────
  async function handleDrawPolygon(event: CustomEvent<{ pixelPolygon: PixelCoord[] }>) {
    if (!currentMap || !userId) return;
    const name = getNextShapeName();
    const id = await createFootprint(supabase, {
      mapId: currentMap.id,
      userId,
      pixelPolygon: event.detail.pixelPolygon,
      name,
      category: null,
      featureType: geometryMode === 'LineString' ? 'road' : 'building',
    });
    if (id) {
      const newFp: FootprintSubmission = {
        id,
        mapId: currentMap.id,
        userId,
        pixelPolygon: event.detail.pixelPolygon,
        name,
        category: null,
        featureType: geometryMode === 'LineString' ? 'road' : 'building',
        status: 'submitted',
      };
      footprints = [...footprints, newFp];
      newFootprintId = id;
      setTimeout(() => { newFootprintId = null; }, 150);
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

  async function handleRemoveFootprint(event: CustomEvent<{ footprintId: string }>) {
    const ok = await deleteFootprint(supabase, event.detail.footprintId);
    if (ok) {
      footprints = footprints.filter((f) => f.id !== event.detail.footprintId);
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

  // Zoom to footprint: we relay footprintId via a store so TraceTool can do it
  // without a direct ref — via ImageShell context. We use a simple event bus approach:
  // set a reactive variable that TraceSidebar triggers from its zoomToFootprint dispatch.
  let zoomTargetId: string | null = null;
  function handleZoomToFootprint(event: CustomEvent<{ footprintId: string }>) {
    // TraceTool doesn't expose zoomToFootprint directly (no bind:this needed).
    // ImageShell exposes footprintSource via context; we rely on TraceTool's
    // OL interactions to handle this — emit to a custom event bus store instead.
    // For now: dispatch a custom window event that TraceTool listens to.
    window.dispatchEvent(new CustomEvent('trace:zoom', { detail: event.detail }));
  }

  onMount(loadMaps);
</script>

<svelte:head>
  <title>{currentMap ? `${currentMap.name} — Trace` : 'Trace Maps'} — Vietnam Map Archive</title>
  <meta name="description" content="Trace building footprints and road networks on historical maps." />
  <link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

<!-- ── Top bar ─────────────────────────────────────────────────────────────── -->
<div class="trace-page">
  <header class="top-bar">
    <a href="/" class="home-link" title="Back to home" aria-label="Home">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 6l6-4.5L14 6v7.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 13.5V6z"/>
        <path d="M6 15V9h4v6"/>
      </svg>
    </a>

    <!-- Map picker -->
    <div class="map-picker">
      <button
        type="button"
        class="map-picker-btn"
        class:active={mapSearchOpen}
        on:click={() => { mapSearchOpen = !mapSearchOpen; }}
        aria-expanded={mapSearchOpen}
        aria-label="Select map"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
        </svg>
        <span class="picker-label">{currentMap?.name ?? 'Select a map…'}</span>
        <svg class="chevron" class:open={mapSearchOpen} width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <polyline points="4 6 8 10 12 6"/>
        </svg>
      </button>

      {#if mapSearchOpen}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="map-dropdown-backdrop" on:click={() => (mapSearchOpen = false)}></div>
        <div class="map-dropdown">
          <div class="search-row">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="7" cy="7" r="5"/><path d="M15 15l-3.5-3.5"/>
            </svg>
            <input
              type="text"
              class="search-input"
              placeholder="Search maps…"
              bind:value={searchQuery}
              autofocus
            />
          </div>
          <ul class="map-list" role="listbox">
            {#if loading}
              <li class="map-list-empty">Loading maps…</li>
            {:else if !filteredMaps.length}
              <li class="map-list-empty">{searchQuery ? 'No matches.' : 'No traceable maps yet.'}</li>
            {:else}
              {#each filteredMaps as m (m.id)}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <li
                  class="map-list-item"
                  class:selected={currentMap?.id === m.id}
                  role="option"
                  aria-selected={currentMap?.id === m.id}
                  on:click={() => selectMap(m)}
                >
                  {m.name}
                </li>
              {/each}
            {/if}
          </ul>
        </div>
      {/if}
    </div>

    <div class="top-stats">
      {#if currentMap}
        <span class="stat">{myFootprints.length} shape{myFootprints.length !== 1 ? 's' : ''}</span>
      {/if}
    </div>
  </header>

  <!-- ── Workspace ──────────────────────────────────────────────────────────── -->
  <ToolLayout bind:sidebarCollapsed bind:isMobile bind:isCompact>
    <!-- Sidebar -->
    <svelte:fragment slot="sidebar">
      <aside class="panel">
        {#if !currentMap}
          <div class="panel-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
            </svg>
            <p>Select a map above to start tracing.</p>
          </div>
        {:else}
          <div class="panel-header">
            <div class="panel-mode-label">Trace Mode</div>
            <button
              type="button"
              class="collapse-btn"
              on:click={() => (sidebarCollapsed = true)}
              aria-label="Collapse sidebar"
              title="Collapse"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M15 3H5a2 2 0 00-2 2v14a2 2 0 002 2h10"/><path d="M19 8l-4 4 4 4"/>
              </svg>
            </button>
          </div>
          <TraceSidebar
            {traceCategories}
            placedFootprints={myFootprints}
            {drawMode}
            {newFootprintId}
            on:removeFootprint={handleRemoveFootprint}
            on:updateFootprintMeta={handleUpdateFootprintMeta}
            on:zoomToFootprint={handleZoomToFootprint}
          />
        {/if}
      </aside>
    </svelte:fragment>

    <!-- Image stage -->
    {#if currentMap && iiifInfoUrl}
      <ImageShell
        {iiifInfoUrl}
        {footprints}
        myUserId={userId}
      >
        <TraceTool
          {drawMode}
          {geometryMode}
          placingEnabled={drawMode === 'trace'}
          myUserId={userId}
          on:drawPolygon={handleDrawPolygon}
          on:modifyFootprint={handleModifyFootprint}
          on:removeFootprint={handleRemoveFootprint}
        />
      </ImageShell>
    {:else if !currentMap}
      <div class="empty-stage">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.25">
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
        </svg>
        <p>Select a map from the top bar to begin tracing.</p>
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
          <div class="panel-mode-label">{currentMap?.name ?? 'Trace'}</div>
          <button type="button" class="panel-close" on:click={() => (sidebarCollapsed = true)} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {#if currentMap}
          <TraceSidebar
            {traceCategories}
            placedFootprints={myFootprints}
            {drawMode}
            {newFootprintId}
            on:removeFootprint={handleRemoveFootprint}
            on:updateFootprintMeta={handleUpdateFootprintMeta}
            on:zoomToFootprint={handleZoomToFootprint}
          />
        {:else}
          <div class="panel-empty">Select a map first.</div>
        {/if}
      </aside>
    </svelte:fragment>
  </ToolLayout>

  <!-- ── Tool mode bottom bar ───────────────────────────────────────────────── -->
  {#if currentMap}
    <footer class="bottom-bar">
      <button
        type="button"
        class="tool-btn"
        class:active={traceTool === 'polygon'}
        on:click={() => (traceTool = 'polygon')}
        title="Draw polygon (closed area)"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
        </svg>
        <span>Polygon</span>
      </button>

      <button
        type="button"
        class="tool-btn"
        class:active={traceTool === 'line'}
        on:click={() => (traceTool = 'line')}
        title="Draw line (road, waterway)"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 19 8 10 14 14 20 5"/>
        </svg>
        <span>Line</span>
      </button>

      <button
        type="button"
        class="tool-btn"
        class:active={traceTool === 'edit'}
        on:click={() => (traceTool = 'edit')}
        title="Select and edit shapes"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
        </svg>
        <span>Edit</span>
      </button>

      <div class="bar-divider"></div>

      {#if !isMobile}
        <button
          type="button"
          class="tool-btn sidebar-toggle"
          on:click={() => (sidebarCollapsed = !sidebarCollapsed)}
          title={sidebarCollapsed ? 'Show shapes panel' : 'Hide shapes panel'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
          </svg>
          <span>{sidebarCollapsed ? 'Shapes' : 'Hide'}</span>
        </button>
      {/if}
    </footer>
  {/if}
</div>

<style>
  /* ── Page shell ──────────────────────────────────────────────────────────── */
  .trace-page {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--color-bg, #f5f0ea);
    overflow: hidden;
    font-family: var(--font-family-base, 'Be Vietnam Pro', sans-serif);
  }

  /* ── Top bar ──────────────────────────────────────────────────────────────── */
  .top-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    height: 48px;
    padding: 0 1rem;
    background: var(--color-white, #fff);
    border-bottom: var(--border-thick, 2px solid #2b2520);
    flex-shrink: 0;
    z-index: 20;
  }

  .home-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm, 4px);
    color: var(--color-text, #2b2520);
    text-decoration: none;
    opacity: 0.55;
    transition: opacity 0.1s, background 0.1s;
    flex-shrink: 0;
  }
  .home-link:hover { opacity: 1; background: var(--color-gray-100, #f1ece6); }

  /* ── Map picker  ─────────────────────────────────────────────────────────── */
  .map-picker {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .map-picker-btn {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    width: 100%;
    max-width: 480px;
    padding: 0.3rem 0.6rem;
    background: var(--color-bg, #f5f0ea);
    border: var(--border-thin, 1px solid #2b2520);
    border-radius: var(--radius-sm, 4px);
    color: var(--color-text, #2b2520);
    font-family: var(--font-family-base, 'Be Vietnam Pro', sans-serif);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s, border-color 0.1s;
  }
  .map-picker-btn:hover { background: var(--color-yellow, #f4d47d); }
  .map-picker-btn.active { border-color: var(--color-blue, #2563eb); background: var(--color-yellow, #f4d47d); }

  .picker-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .chevron { flex-shrink: 0; opacity: 0.5; transition: transform 0.15s; }
  .chevron.open { transform: rotate(180deg); }

  /* Dropdown */
  .map-dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 39;
  }
  .map-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    width: min(480px, 90vw);
    background: var(--color-white, #fff);
    border: var(--border-thick, 2px solid #2b2520);
    border-radius: var(--radius-sm, 4px);
    box-shadow: 4px 4px 0 var(--color-border, #2b2520);
    z-index: 40;
    overflow: hidden;
  }
  .search-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.65rem;
    border-bottom: var(--border-thin, 1px solid #2b2520);
  }
  .search-row svg { opacity: 0.4; flex-shrink: 0; }
  .search-input {
    flex: 1;
    border: none;
    outline: none;
    background: none;
    font-family: var(--font-family-base, 'Be Vietnam Pro', sans-serif);
    font-size: 0.82rem;
    color: var(--color-text, #2b2520);
  }
  .map-list {
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
    max-height: 280px;
    overflow-y: auto;
  }
  .map-list-item {
    padding: 0.42rem 0.75rem;
    font-size: 0.82rem;
    cursor: pointer;
    transition: background 0.08s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .map-list-item:hover { background: var(--color-yellow, #f4d47d); }
  .map-list-item.selected { background: var(--color-blue, #2563eb); color: #fff; }
  .map-list-empty {
    padding: 0.75rem;
    font-size: 0.8rem;
    color: var(--color-gray-500, #888);
    text-align: center;
  }

  /* ── Top stats ───────────────────────────────────────────────────────────── */
  .top-stats {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    margin-left: auto;
  }
  .stat {
    font-size: 0.78rem;
    font-weight: 700;
    opacity: 0.55;
  }

  /* ── Panel (sidebar) ─────────────────────────────────────────────────────── */
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg, #f5f0ea);
    border-right: var(--border-thick, 2px solid #2b2520);
    overflow: hidden;
    min-width: 0;
  }
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    background: var(--color-white, #fff);
    border-bottom: var(--border-thick, 2px solid #2b2520);
    flex-shrink: 0;
  }
  .panel-mode-label {
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text, #2b2520);
    opacity: 0.6;
  }
  .collapse-btn, .panel-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: var(--border-thin, 1px solid #2b2520);
    border-radius: var(--radius-sm, 4px);
    background: var(--color-white, #fff);
    cursor: pointer;
    color: var(--color-text, #2b2520);
    opacity: 0.55;
    transition: opacity 0.1s, background 0.1s;
  }
  .collapse-btn:hover, .panel-close:hover { opacity: 1; background: var(--color-gray-100, #f1ece6); }

  .panel-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    flex: 1;
    padding: 1.5rem;
    text-align: center;
    font-size: 0.85rem;
    color: var(--color-text, #2b2520);
    opacity: 0.5;
  }

  /* ── Empty / loading stages ──────────────────────────────────────────────── */
  .empty-stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    height: 100%;
    font-family: var(--font-family-base, 'Be Vietnam Pro', sans-serif);
    color: var(--color-text, #2b2520);
    opacity: 0.7;
    font-size: 0.875rem;
  }
  .catalog-link {
    font-weight: 700;
    color: var(--color-text, #2b2520);
    text-decoration: none;
    opacity: 0.8;
  }
  .catalog-link:hover { opacity: 1; text-decoration: underline; }

  .loading-stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    height: 100%;
    font-family: var(--font-family-base, 'Be Vietnam Pro', sans-serif);
    font-size: 0.875rem;
    color: var(--color-text, #2b2520);
    opacity: 0.6;
  }
  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(212, 175, 55, 0.3);
    border-top-color: #d4af37;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Bottom bar ──────────────────────────────────────────────────────────── */
  .bottom-bar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    height: 46px;
    padding: 0 0.75rem;
    background: var(--color-white, #fff);
    border-top: var(--border-thick, 2px solid #2b2520);
    flex-shrink: 0;
    z-index: 20;
  }
  .tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.7rem;
    border: var(--border-thin, 1px solid #2b2520);
    border-radius: var(--radius-sm, 4px);
    background: var(--color-bg, #f5f0ea);
    color: var(--color-text, #2b2520);
    font-family: var(--font-family-base, 'Be Vietnam Pro', sans-serif);
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.1s;
  }
  .tool-btn:hover { background: var(--color-yellow, #f4d47d); }
  .tool-btn.active {
    background: var(--color-blue, #2563eb);
    color: #fff;
    border-color: var(--color-blue, #2563eb);
  }
  .tool-btn span { white-space: nowrap; }

  .bar-divider { flex: 1; }

  .sidebar-toggle { margin-left: auto; }
</style>
