<!--
  /image — Read-only IIIF image viewer.
  URL: /image?map=<uuid>
  Loads the map's iiif_image service URL, displays it in ImageShell.
  Links to /view if the map has an allmaps_id (georeferenced).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import ToolLayout from '$lib/shell/ToolLayout.svelte';
  import ImageShell from '$lib/shell/ImageShell.svelte';
  import { getSupabaseContext } from '$lib/supabase/context';
  import { fetchMapById } from '$lib/maps/service';
  import type { MapListItem } from '$lib/maps/types';

  const { supabase } = getSupabaseContext();

  let map: MapListItem | null = null;
  let iiifInfoUrl: string | null = null;
  let loading = true;
  let error = '';
  let sidebarCollapsed = false;
  let isMobile = false;
  let isCompact = false;

  $: mapId = $page.url.searchParams.get('map');

  async function loadMap(id: string) {
    loading = true;
    error = '';
    map = await fetchMapById(supabase, id);
    if (!map) {
      error = 'Map not found.';
      loading = false;
      return;
    }
    if (!map.iiif_image) {
      error = 'This map has no image source.';
      loading = false;
      return;
    }
    iiifInfoUrl = map.iiif_image + '/info.json';
    loading = false;
  }

  onMount(() => {
    if (mapId) loadMap(mapId);
    else loading = false;
  });

  $: if (mapId) loadMap(mapId);
</script>

<svelte:head>
  <title>{map ? `${map.name} — Image Viewer` : 'Image Viewer'} — Vietnam Map Archive</title>
</svelte:head>

<ToolLayout bind:sidebarCollapsed bind:isMobile bind:isCompact>
  <!-- Sidebar -->
  <svelte:fragment slot="sidebar">
    <div class="img-sidebar">
      <div class="sidebar-header">
        <a href="/catalog" class="back-link">← Back to catalog</a>
        <h2 class="sidebar-title">Image Viewer</h2>
      </div>

      {#if loading}
        <div class="sidebar-state">Loading…</div>
      {:else if error}
        <div class="sidebar-state error">{error}</div>
      {:else if map}
        <div class="map-meta">
          <h3 class="map-name">{map.name}</h3>
          {#if map.year || map.year_label}
            <p class="map-year">{map.year_label ?? map.year}</p>
          {/if}
          {#if map.location}
            <p class="map-loc">{map.location}</p>
          {/if}
          {#if map.dc_description}
            <p class="map-desc">{map.dc_description}</p>
          {/if}
          {#if map.collection}
            <p class="map-coll">Source: {map.collection}</p>
          {/if}
        </div>

        <div class="sidebar-actions">
          {#if map.allmaps_id}
            <a href="/view?map={map.id}" class="action-link primary">View on Map</a>
          {/if}
        </div>
      {:else}
        <div class="sidebar-state muted">Select a map from the <a href="/catalog">catalog</a>.</div>
      {/if}
    </div>
  </svelte:fragment>

  <!-- Image stage -->
  {#if map && iiifInfoUrl}
    <ImageShell {iiifInfoUrl} />
  {:else if !loading && !mapId}
    <div class="empty-stage">
      <p>No map selected.</p>
      <a href="/catalog" class="action-link primary">Browse catalog →</a>
    </div>
  {/if}
</ToolLayout>

<style>
  .img-sidebar {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.25rem;
    height: 100%;
    overflow-y: auto;
    background: var(--color-white);
    border-right: var(--border-thick);
    font-family: var(--font-family-base);
  }

  .sidebar-header {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .back-link {
    font-family: var(--font-family-display);
    font-weight: var(--font-bold);
    font-size: 0.8rem;
    color: var(--color-text);
    text-decoration: none;
  }
  .back-link:hover { text-decoration: underline; }

  .sidebar-title {
    font-family: var(--font-family-display);
    font-weight: var(--font-extrabold);
    font-size: 1rem;
    margin: 0;
    border-bottom: var(--border-thin);
    padding-bottom: 0.75rem;
  }

  .sidebar-state {
    font-size: 0.875rem;
    color: var(--color-gray-500);
  }
  .sidebar-state.error { color: var(--color-primary); }
  .sidebar-state.muted { color: var(--color-gray-500); }

  .map-meta {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .map-name {
    font-family: var(--font-family-display);
    font-weight: var(--font-extrabold);
    font-size: 1rem;
    margin: 0;
    line-height: 1.3;
  }
  .map-year, .map-loc, .map-coll {
    font-size: 0.8rem;
    color: var(--color-gray-500);
    margin: 0;
  }
  .map-desc {
    font-size: 0.8rem;
    line-height: 1.5;
    margin: 0.25rem 0 0;
    color: var(--color-text);
  }

  .sidebar-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: auto;
    padding-top: 1rem;
    border-top: var(--border-thin);
  }

  .action-link {
    display: block;
    text-align: center;
    padding: 0.6rem 1rem;
    font-family: var(--font-family-display);
    font-weight: var(--font-bold);
    font-size: 0.875rem;
    text-decoration: none;
    border: var(--border-thin);
    border-radius: var(--radius-pill);
    box-shadow: 2px 2px 0 var(--color-border);
    transition: transform 0.1s, box-shadow 0.1s;
  }
  .action-link:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0 var(--color-border);
  }
  .action-link.primary { background: var(--color-yellow); }
  .action-link.secondary { background: var(--color-white); }

  /* Empty stage when no map selected */
  .empty-stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    height: 100%;
    font-family: var(--font-family-base);
    color: var(--color-gray-500);
  }
</style>
