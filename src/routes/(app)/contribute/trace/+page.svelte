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
  import NavBar from '$lib/ui/NavBar.svelte';
  import ToolLayout from '$lib/shell/ToolLayout.svelte';
  import ImageShell from '$lib/shell/ImageShell.svelte';
  import MapSearchBar from '$lib/ui/MapSearchBar.svelte';
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

  function getNextShapeName(): string {
    return `Shape ${myFootprints.length + 1}`;
  }

  // ── Load all traceable maps ────────────────────────────────────────────────
  async function loadMaps() {
    try {
      maps = await fetchLabelMaps(supabase);
    } catch (err) {
      console.error('[TracePage] Failed to load maps:', err);
    }
  }

  // ── Select a map ──────────────────────────────────────────────────────────
  async function selectMap(map: LabelMapInfo) {
    if (currentMap?.id === map.id) return;
    currentMap = map;
    iiifInfoUrl = null;
    footprints = [];
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

<!-- ── Page shell ─────────────────────────────────────────────────────────────── -->
<div class="tool-page">
  <NavBar />
  <ToolLayout bind:sidebarCollapsed bind:isMobile bind:isCompact>
    <!-- Sidebar -->
    <svelte:fragment slot="sidebar">
      <aside class="panel">
        <div class="panel-header">
          <a href="/contribute" class="home-link" aria-label="Back to Contribute">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.5 15L7.5 10L12.5 5"/>
            </svg>
            Contribute
          </a>
          <div class="panel-mode-label">Trace Mode</div>
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
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
            </svg>
            <p>Select a map to start tracing.</p>
          </div>
        {:else}
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

    <!-- Floating map search (canvas, top-center) — maps only, no location tab -->
    <MapSearchBar
      maps={maps as any}
      selectedMapId={currentMap?.id ?? null}
      mapsOnly={true}
      on:selectMap={(e) => selectMap(e.detail.map as any)}
    />

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
        <p>Select a map to begin tracing.</p>
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
          <div class="panel-mode-label">{currentMap?.name ?? 'Trace'}</div>
          <button type="button" class="collapse-btn" on:click={() => (sidebarCollapsed = true)} aria-label="Close">
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
  @import '$styles/layouts/tool-page.css';
</style>
