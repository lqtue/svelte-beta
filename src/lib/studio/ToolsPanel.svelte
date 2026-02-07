<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { BASEMAP_DEFS } from '$lib/viewer/constants';
  import type { ViewMode, MapListItem } from '$lib/viewer/types';

  const dispatch = createEventDispatcher<{
    selectMap: { id: string };
    changeBasemap: { key: string };
    changeViewMode: { mode: ViewMode };
    changeOpacity: { value: number };
    toggleCollapse: void;
  }>();

  export let mapList: MapListItem[] = [];
  export let selectedMapId = '';
  export let basemapSelection = 'g-streets';
  export let viewMode: ViewMode = 'overlay';
  export let opacity = 0.8;
  export let collapsed = false;

  let mapTypeSelection = 'all';

  $: mapTypes = Array.from(new Set(mapList.map((item) => item.type || 'Uncategorized')))
    .filter((t) => t && t.trim().length)
    .sort((a, b) => a.localeCompare(b));

  $: filteredMapList =
    mapTypeSelection === 'all'
      ? mapList
      : mapList.filter((item) => item.type.toLowerCase() === mapTypeSelection.toLowerCase());

  $: featuredMaps = (() => {
    const featured = mapList.filter((item) => item.isFeatured);
    return (featured.length ? featured : mapList).slice(0, 4);
  })();

  $: opacityPercent = Math.round(opacity * 100);
</script>

{#if collapsed}
  <button type="button" class="panel-toggle" on:click={() => dispatch('toggleCollapse')}>
    Show tools
  </button>
{:else}
  <aside class="panel">
    <button
      type="button"
      class="panel-collapse"
      on:click={() => dispatch('toggleCollapse')}
      aria-expanded="true"
    >
      Hide tools
    </button>
    <div class="panel-scroll custom-scrollbar">
      <section class="panel-card">
        <header class="panel-card-header">
          <h2>View control</h2>
        </header>
        <section class="panel-card-section">
          <span class="section-title">View mode</span>
          <div class="button-group wrap">
            <button type="button" class:selected={viewMode === 'overlay'} on:click={() => dispatch('changeViewMode', { mode: 'overlay' })}>
              Overlay
            </button>
            <button type="button" class:selected={viewMode === 'side-x'} on:click={() => dispatch('changeViewMode', { mode: 'side-x' })}>
              Side-X
            </button>
            <button type="button" class:selected={viewMode === 'side-y'} on:click={() => dispatch('changeViewMode', { mode: 'side-y' })}>
              Side-Y
            </button>
            <button type="button" class:selected={viewMode === 'spy'} on:click={() => dispatch('changeViewMode', { mode: 'spy' })}>
              Glass
            </button>
          </div>
        </section>
        <section class="panel-card-section">
          <span class="section-title">Overlay opacity</span>
          <div class="slider">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              bind:value={opacity}
              on:input={() => dispatch('changeOpacity', { value: opacity })}
            />
            <span>{opacityPercent}%</span>
          </div>
        </section>
      </section>

      <section class="panel-card">
        <header class="panel-card-header">
          <h2>Historical maps</h2>
        </header>
        {#if featuredMaps.length}
          <section class="panel-card-section">
            <span class="section-title">Featured</span>
            <div class="history-featured">
              {#each featuredMaps as item (item.id)}
                <button
                  type="button"
                  class="history-featured-card"
                  class:selected={item.id === selectedMapId}
                  on:click={() => dispatch('selectMap', { id: item.id })}
                >
                  <span class="history-title">{item.name}</span>
                  {#if item.summary}
                    <span class="history-meta">{item.summary}</span>
                  {/if}
                </button>
              {/each}
            </div>
          </section>
        {/if}
        <section class="panel-card-section">
          <label class="history-filter">
            <span>Filter by type</span>
            <select bind:value={mapTypeSelection}>
              <option value="all">All maps ({mapList.length})</option>
              {#each mapTypes as type}
                <option value={type}>{type}</option>
              {/each}
            </select>
          </label>
        </section>
        <div class="history-list custom-scrollbar">
          {#if filteredMapList.length}
            {#each filteredMapList as item (item.id)}
              <button
                type="button"
                class="history-item"
                class:selected={item.id === selectedMapId}
                on:click={() => dispatch('selectMap', { id: item.id })}
              >
                <span class="history-title">{item.name}</span>
                <span class="history-meta">{item.summary || item.type}</span>
              </button>
            {/each}
          {:else}
            <p class="empty-state">Map catalog is loading&hellip;</p>
          {/if}
        </div>
      </section>

      <section class="panel-card">
        <header class="panel-card-header">
          <h2>Basemap</h2>
        </header>
        <section class="panel-card-section">
          <div class="button-group wrap">
            {#each BASEMAP_DEFS as base}
              <button
                type="button"
                class:selected={basemapSelection === base.key}
                on:click={() => dispatch('changeBasemap', { key: base.key })}
              >
                {base.label}
              </button>
            {/each}
          </div>
        </section>
      </section>
    </div>
  </aside>
{/if}

<style>
  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.95) 0%, rgba(232, 213, 186, 0.95) 100%);
    border: 2px solid #d4af37;
    border-radius: 4px;
    padding: 0.9rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    backdrop-filter: blur(12px);
    height: 100%;
    max-height: none;
    overflow: hidden;
    min-width: 0;
    color: #2b2520;
  }

  .panel-collapse {
    align-self: flex-start;
    border: 1px solid rgba(212, 175, 55, 0.4);
    background: rgba(255, 255, 255, 0.5);
    border-radius: 2px;
    color: #6b5d52;
    font-size: 0.72rem;
    padding: 0.25rem 0.8rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .panel-collapse:hover,
  .panel-collapse:focus-visible {
    background: rgba(212, 175, 55, 0.2);
    border-color: #d4af37;
    outline: none;
  }

  .panel-toggle {
    position: absolute;
    top: 1rem;
    left: 1rem;
    border: 1px solid rgba(212, 175, 55, 0.5);
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.95) 0%, rgba(232, 213, 186, 0.95) 100%);
    border-radius: 2px;
    color: #4a3f35;
    font-size: 0.74rem;
    padding: 0.4rem 0.9rem;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    backdrop-filter: blur(12px);
    transition: all 0.15s ease;
    z-index: 95;
  }

  .panel-toggle:hover,
  .panel-toggle:focus-visible {
    background: rgba(212, 175, 55, 0.25);
    border-color: #d4af37;
    outline: none;
  }

  .panel-scroll {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    padding-right: 0.25rem;
    margin-top: 0.25rem;
  }

  .panel-card {
    background: rgba(255, 255, 255, 0.4);
    border-radius: 4px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    padding: 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .panel-card-header h2 {
    margin: 0;
    font-family: 'Spectral', serif;
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #2b2520;
  }

  .panel-card-section {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .section-title {
    font-family: 'Be Vietnam Pro', sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b5d52;
  }

  .button-group {
    display: flex;
    gap: 0.5rem;
    flex-wrap: nowrap;
  }

  .button-group.wrap {
    flex-wrap: wrap;
  }

  .button-group button,
  .panel-card-section button:not(.history-featured-card):not(.history-item) {
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.5);
    color: #4a3f35;
    padding: 0.55rem 0.75rem;
    font-size: 0.82rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .button-group button.selected {
    background: rgba(212, 175, 55, 0.3);
    border-color: #d4af37;
    color: #2b2520;
    font-weight: 600;
  }

  .button-group button:hover {
    background: rgba(212, 175, 55, 0.15);
    border-color: rgba(212, 175, 55, 0.6);
    transform: translateY(-1px);
  }

  .slider {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .slider input[type='range'] {
    flex: 1 1 auto;
  }

  .slider span {
    font-family: 'Noto Serif', serif;
    font-size: 0.875rem;
    font-weight: 600;
    color: #2b2520;
    min-width: 2.5rem;
    text-align: right;
  }

  .history-featured {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .history-featured-card {
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.4);
    padding: 0.55rem 0.65rem;
    text-align: left;
    color: #4a3f35;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .history-featured-card:hover {
    background: rgba(212, 175, 55, 0.1);
    border-color: rgba(212, 175, 55, 0.5);
  }

  .history-featured-card.selected {
    border-color: #d4af37;
    background: rgba(212, 175, 55, 0.2);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-height: 18rem;
    overflow-y: auto;
    padding-right: 0.2rem;
  }

  .history-item {
    border-radius: 4px;
    border: 1px solid transparent;
    background: rgba(255, 255, 255, 0.3);
    padding: 0.55rem 0.65rem;
    text-align: left;
    color: #4a3f35;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .history-item:hover,
  .history-item:focus-visible {
    border-color: rgba(212, 175, 55, 0.5);
    background: rgba(212, 175, 55, 0.1);
    outline: none;
  }

  .history-item.selected {
    border-color: #d4af37;
    background: rgba(212, 175, 55, 0.2);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .history-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: #2b2520;
  }

  .history-meta {
    font-size: 0.72rem;
    color: #8b7355;
  }

  .history-filter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .history-filter select {
    padding: 0.35rem 0.55rem;
    border-radius: 2px;
    border: 1px solid rgba(212, 175, 55, 0.4);
    background: rgba(255, 255, 255, 0.6);
    color: #2b2520;
  }

  .empty-state {
    margin: 0;
    font-size: 0.78rem;
    color: #8b7355;
  }

  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(212, 175, 55, 0.4) transparent;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(212, 175, 55, 0.4);
    border-radius: 999px;
  }
</style>
