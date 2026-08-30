<!--
  SearchMapsTab.svelte — the "Maps" tab of SearchPanel.
  Client-side filter over the passed map list plus the layer-stack compare toggle.
  Styles live in $styles/components/search-panel.css (imported by SearchPanel).
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { MapListItem } from '$lib/map/types';
  import { layersStore, MAX_OVERLAY_LAYERS, toHistoricalRef } from '$lib/stores/layersStore';

  const dispatch = createEventDispatcher<{
    selectMap: { map: MapListItem };
  }>();

  export let maps: MapListItem[] = [];
  export let selectedMapId: string | null = null;

  let mapsQuery = '';
  let searchInputEl: HTMLInputElement | null = null;

  onMount(() => {
    queueMicrotask(() => searchInputEl?.focus());
  });

  $: compareIds = $layersStore.overlays.map((o) => o.ref.mapId);
  $: compareFull = compareIds.length >= MAX_OVERLAY_LAYERS;

  function toggleCompare(e: Event, map: MapListItem) {
    e.stopPropagation();
    if (compareIds.includes(map.id)) {
      layersStore.removeOverlayByMapId(map.id);
      return;
    }
    const ref = toHistoricalRef(map);
    if (!ref.allmapsId) return;
    layersStore.addOverlay(ref);
  }

  $: filteredMaps = (() => {
    const q = mapsQuery.trim().toLowerCase();
    if (!q) return maps;
    return maps.filter((m) => {
      const haystack = [
        m.name,
        m.location ?? '',
        m.dc_description ?? '',
        m.year != null ? String(m.year) : '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  })();

  function handleMapResultClick(map: MapListItem) {
    dispatch('selectMap', { map });
  }
</script>

<div class="search-form">
  <input
    type="text"
    placeholder="Filter by title, city, or year…"
    bind:value={mapsQuery}
    bind:this={searchInputEl}
  />
</div>
<div class="results-list custom-scrollbar">
  {#if filteredMaps.length}
    {#each filteredMaps as map (map.id)}
      {@const inCompare = compareIds.includes(map.id)}
      <div
        class="result-item map-item"
        class:active-map={map.id === selectedMapId}
        on:click={() => handleMapResultClick(map)}
        role="button"
        tabindex="0"
        on:keydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleMapResultClick(map);
        }}
      >
        <div class="result-body">
          <div class="result-row">
            <span class="result-title">{map.name}</span>
            {#if map.id === selectedMapId}
              <span class="badge active-badge">Active</span>
            {/if}
          </div>
          <div class="result-meta">
            {#if map.year}<span class="badge year-badge">{map.year}</span>{/if}
            {#if map.location}<span class="badge type-badge">{map.location}</span>{/if}
          </div>
        </div>
        {#if map.allmaps_id}
          <button
            type="button"
            class="compare-row-btn"
            class:active={inCompare}
            disabled={compareFull && !inCompare}
            on:click={(e) => toggleCompare(e, map)}
            title={inCompare
              ? 'Remove from layer stack'
              : compareFull
                ? `Layer stack full (${MAX_OVERLAY_LAYERS} max)`
                : 'Add to layer stack'}
            aria-label={inCompare ? 'Remove from compare' : 'Add to compare'}
          >
            {inCompare ? '✓' : '⇄'}
          </button>
        {/if}
      </div>
    {/each}
  {:else if mapsQuery.trim()}
    <p class="empty-msg">No maps match “{mapsQuery}”.</p>
  {:else}
    <p class="empty-msg">No maps loaded yet.</p>
  {/if}
</div>
