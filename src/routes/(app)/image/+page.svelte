<!--
  /image — Read-only IIIF image viewer.
  URL: /image?map=<uuid>

  Same shell pattern as /contribute/label and /contribute/trace:
    NavBar → top-bar (map picker) → ToolLayout (sidebar + ImageShell)

  Sidebar shows map metadata. No tools — read-only.
  Pre-selects map from ?map= URL param on mount.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import NavBar from '$lib/ui/NavBar.svelte';
  import ToolLayout from '$lib/shell/ToolLayout.svelte';
  import ImageShell from '$lib/shell/ImageShell.svelte';
  import MapSearchBar from '$lib/ui/MapSearchBar.svelte';
  import { getSupabaseContext } from '$lib/supabase/context';
  import { fetchMaps } from '$lib/maps/service';
  import type { MapListItem } from '$lib/maps/types';

  const { supabase } = getSupabaseContext();

  // ── Map list ───────────────────────────────────────────────────────────────
  let maps: MapListItem[] = [];
  let currentMap: MapListItem | null = null;
  let iiifInfoUrl: string | null = null;

  // ── Layout ─────────────────────────────────────────────────────────────────
  let sidebarCollapsed = false;
  let isMobile = false;
  let isCompact = false;

  // ── Derived ────────────────────────────────────────────────────────────────
  $: imageMaps = maps.filter((m) => !!m.iiif_image);

  // ── Load ───────────────────────────────────────────────────────────────────
  async function loadMaps() {
    try { maps = await fetchMaps(supabase); }
    catch (err) { console.error('[ImagePage] Failed to load maps:', err); }
  }

  function selectMap(map: MapListItem) {
    if (currentMap?.id === map.id) return;
    currentMap = map;
    iiifInfoUrl = map.iiif_image ? map.iiif_image + '/info.json' : null;
  }

  onMount(async () => {
    await loadMaps();
    // Pre-select from URL param
    const paramId = $page.url.searchParams.get('map');
    if (paramId) {
      const match = maps.find((m) => m.id === paramId);
      if (match) selectMap(match);
    }
  });
</script>

<svelte:head>
  <title>{currentMap ? `${currentMap.name} — Image Viewer` : 'Image Viewer'} — Vietnam Map Archive</title>
  <meta name="description" content="View high-resolution scans of historical maps of Vietnam." />
  <link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

<!-- ── Page shell ──────────────────────────────────────────────────────────── -->
<div class="tool-page">
  <NavBar />

  <!-- ── Workspace ───────────────────────────────────────────────────────── -->
  <ToolLayout bind:sidebarCollapsed bind:isMobile bind:isCompact>
    <!-- Sidebar: map metadata -->
    <svelte:fragment slot="sidebar">
      <aside class="panel">
        <div class="panel-header">
          <a href="/catalog" class="home-link" aria-label="Back to Catalog">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.5 15L7.5 10L12.5 5"/>
            </svg>
            Catalog
          </a>
          <div class="panel-mode-label">Image Viewer</div>
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
              <rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M9 21V9"/>
            </svg>
            <p>Select a map to view its image.</p>
          </div>
        {:else}
          <div class="map-meta">
            <h3 class="meta-name">{currentMap.name}</h3>

            {#if currentMap.year_label ?? currentMap.year}
              <p class="meta-row">
                <span class="meta-key">Year</span>
                <span class="meta-val">{currentMap.year_label ?? currentMap.year}</span>
              </p>
            {/if}

            {#if currentMap.location}
              <p class="meta-row">
                <span class="meta-key">Location</span>
                <span class="meta-val">{currentMap.location}</span>
              </p>
            {/if}

            {#if currentMap.collection}
              <p class="meta-row">
                <span class="meta-key">Source</span>
                <span class="meta-val">{currentMap.collection}</span>
              </p>
            {/if}

            {#if currentMap.dc_description}
              <p class="meta-desc">{currentMap.dc_description}</p>
            {/if}

            <div class="meta-actions">
              {#if currentMap.allmaps_id}
                <a href="/view?map={currentMap.id}" class="meta-action-btn primary">View on Map</a>
              {/if}
              <a href="/catalog" class="meta-action-btn secondary">← Catalog</a>
            </div>
          </div>
        {/if}
      </aside>
    </svelte:fragment>

    <!-- Floating map search (canvas, top-center) — maps only, no location tab -->
    <MapSearchBar
      maps={imageMaps as any}
      selectedMapId={currentMap?.id ?? null}
      mapsOnly={true}
      on:selectMap={(e) => selectMap(e.detail.map as any)}
    />

    <!-- Image stage -->
    {#if currentMap && iiifInfoUrl}
      <ImageShell {iiifInfoUrl} />
    {:else if !currentMap}
      <div class="empty-stage">
        <p>Select a map from the search bar above.</p>
        <a href="/catalog" class="catalog-link">Browse catalog →</a>
      </div>
    {/if}
  </ToolLayout>
</div>

<style>
  @import '$styles/layouts/tool-page.css';
</style>
