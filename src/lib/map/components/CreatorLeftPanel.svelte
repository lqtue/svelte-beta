<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { MapListItem, ViewMode } from '$lib/viewer/types';
  import type { BASEMAP_DEFS } from '$lib/viewer/constants';

  export let viewMode: ViewMode = 'overlay';
  export let opacity = 0.8;
  export let viewerFeaturedMaps: MapListItem[] = [];
  export let selectedMapId = '';
  export let mapTypeSelection = 'all';
  export let mapList: MapListItem[] = [];
  export let mapTypes: string[] = [];
  export let viewerAllMaps: MapListItem[] = [];
  export let basemapSelection = 'g-streets';
  export let BASEMAP_DEFS: any[] = [];

  const dispatch = createEventDispatcher<{
    handleModeClick: ViewMode;
    handleOpacityInput: number;
    selectMapById: string;
    updateBasemap: string;
  }>();
</script>

<aside class="creator-panel left">
  <button
    type="button"
    class="panel-collapse"
    on:click={() => dispatch('handleModeClick', 'overlay')}
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
          <button type="button" class:selected={viewMode === 'overlay'} on:click={() => dispatch('handleModeClick', 'overlay')}>
            Overlay
          </button>
          <button type="button" class:selected={viewMode === 'side-x'} on:click={() => dispatch('handleModeClick', 'side-x')}>
            Side-X
          </button>
          <button type="button" class:selected={viewMode === 'side-y'} on:click={() => dispatch('handleModeClick', 'side-y')}>
            Side-Y
          </button>
          <button type="button" class:selected={viewMode === 'spy'} on:click={() => dispatch('handleModeClick', 'spy')}>
            Glass
          </button>
        </div>
      </section>
      <section class="panel-card-section">
        <span class="section-title">Overlay opacity</span>
        <div class="slider">
          <input type="range" min="0" max="1" step="0.05" bind:value={opacity} on:input={(e) => dispatch('handleOpacityInput', e.currentTarget.valueAsNumber)} />
          <span>{Math.round(opacity * 100)}%</span>
        </div>
      </section>
    </section>

    <section class="panel-card">
      <header class="panel-card-header">
        <h2>Historical maps</h2>
      </header>
      {#if viewerFeaturedMaps.length}
        <section class="panel-card-section">
          <span class="section-title">Featured</span>
          <div class="history-featured">
            {#each viewerFeaturedMaps as item (item.id)}
              <button
                type="button"
                class="history-featured-card"
                class:selected={item.id === selectedMapId}
                on:click={() => dispatch('selectMapById', item.id)}
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
        {#if viewerAllMaps.length}
          {#each viewerAllMaps as item (item.id)}
            <button
              type="button"
              class="history-item"
              class:selected={item.id === selectedMapId}
              on:click={() => dispatch('selectMapById', item.id)}
            >
              <span class="history-title">{item.name}</span>
              <span class="history-meta">{item.summary || item.type}</span>
            </button>
          {/each}
        {:else}
          <p class="empty-state">Map catalog is loading…</p>
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
              on:click={() => dispatch('updateBasemap', base.key)}
            >
              {base.label}
            </button>
          {/each}
        </div>
      </section>
    </section>
  </div>
</aside>
<style>
.creator-panel.left,
  .creator-panel.right {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 1rem;
    padding: 0.9rem;
    box-shadow: 0 24px 48px rgba(2, 6, 23, 0.45);
    backdrop-filter: blur(18px);
    height: 100%;
    max-height: none;
    overflow: hidden;
    min-width: 0;
  }
  .panel-collapse {
    align-self: flex-start;
    border: none;
    background: rgba(15, 23, 42, 0.7);
    border-radius: 999px;
    color: inherit;
    font-size: 0.72rem;
    padding: 0.25rem 0.8rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .panel-collapse:hover,
  .panel-collapse:focus-visible {
    background: rgba(99, 102, 241, 0.35);
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
    background: rgba(15, 23, 42, 0.85);
    border-radius: 1.1rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    padding: 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    backdrop-filter: blur(18px);
  }

  .panel-card-header h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
  }
  .panel-card-section {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .section-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(148, 163, 184, 0.8);
  }
  .history-featured {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .history-featured-card {
    border: 1px solid transparent;
    border-radius: 0.75rem;
    background: rgba(30, 41, 59, 0.7);
    padding: 0.55rem 0.65rem;
    text-align: left;
    color: inherit;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .history-featured-card.selected {
    border-color: rgba(99, 102, 241, 0.75);
    box-shadow: 0 12px 24px rgba(67, 56, 202, 0.35);
  }
  .history-filter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .history-filter select {
    padding: 0.35rem 0.55rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.65);
    color: inherit;
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
    border-radius: 0.75rem;
    border: 1px solid transparent;
    background: rgba(15, 23, 42, 0.55);
    padding: 0.55rem 0.65rem;
    text-align: left;
    color: inherit;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .history-item:hover,
  .history-item:focus-visible {
    border-color: rgba(99, 102, 241, 0.5);
    outline: none;
  }

  .history-item.selected {
    border-color: rgba(99, 102, 241, 0.8);
    box-shadow: 0 12px 24px rgba(67, 56, 202, 0.35);
  }
  .history-title {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .history-meta {
    font-size: 0.72rem;
    color: rgba(148, 163, 184, 0.78);
  }
  .empty-state {
    margin: 0;
    font-size: 0.78rem;
    color: rgba(148, 163, 184, 0.8);
  }
</style>