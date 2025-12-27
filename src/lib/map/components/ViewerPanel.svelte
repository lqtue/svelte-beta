<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { MapListItem, ViewMode } from '$lib/viewer/types';
  import type { BASEMAP_DEFS } from '$lib/viewer/constants';

  export let viewerPanelOpen = false;
  export let activeViewerSection: 'map' | 'control' | 'story' | 'info' = 'map';
  export let viewerFeaturedMaps: MapListItem[] = [];
  export let selectedMapId = '';
  export let selectedMap: MapListItem | null = null;
  export let basemapSelection = 'g-streets';
  export let BASEMAP_DEFS: any[] = [];
  export let viewerAllMaps: MapListItem[] = [];
  export let mapTypeSelection = 'all';
  export let mapList: MapListItem[] = [];
  export let mapTypes: string[] = [];
  export let viewMode: ViewMode = 'overlay';
  export let opacity = 0.8;
  export let searchQuery = '';
  export let searchLoading = false;
  export let searchNotice: string | null = null;
  export let searchNoticeType: 'info' | 'error' | 'success' = 'info';
  export let searchResults: any[] = [];
  export let visibleStoryScenes: any[] = [];
  export let shareCopied = false;
  export let statusError = false;
  export let statusMessage = '';
  export let appMode: 'explore' | 'create' = 'explore';

  const dispatch = createEventDispatcher<{
    handleViewerTabClick: 'map' | 'control' | 'story' | 'info';
    selectMapById: string;
    openMetadata: void;
    updateBasemap: string;
    handleModeClick: ViewMode;
    handleOpacityInput: number;
    queueSearch: string;
    locateUser: void;
    clearSearch: void;
    zoomToSearchResult: any;
    goToStoryScene: number;
    startStoryPresentation: number;
    copyShareLink: void;
    toggleAppMode: void;
    handleClearState: void;
  }>();
</script>

<div class="viewer-panel" class:collapsed={!viewerPanelOpen}>
  <div class="viewer-tabs">
    <button
      type="button"
      class:selected={activeViewerSection === 'map'}
      on:click={() => dispatch('handleViewerTabClick', 'map')}
      aria-expanded={activeViewerSection === 'map' && viewerPanelOpen}
    >
      Map
    </button>
    <button
      type="button"
      class:selected={activeViewerSection === 'control'}
      on:click={() => dispatch('handleViewerTabClick', 'control')}
      aria-expanded={activeViewerSection === 'control' && viewerPanelOpen}
    >
      Controls
    </button>
    <button
      type="button"
      class:selected={activeViewerSection === 'story'}
      on:click={() => dispatch('handleViewerTabClick', 'story')}
      aria-expanded={activeViewerSection === 'story' && viewerPanelOpen}
    >
      Story
    </button>
    <button
      type="button"
      class:selected={activeViewerSection === 'info'}
      on:click={() => dispatch('handleViewerTabClick', 'info')}
      aria-expanded={activeViewerSection === 'info' && viewerPanelOpen}
    >
      Share & Settings
    </button>
  </div>
  {#if viewerPanelOpen}
  <div class="viewer-section custom-scrollbar">
    {#if activeViewerSection === 'map'}
      <div class="section-group">
        <div class="section-block">
          <h3>Featured historical maps</h3>
          <div class="map-grid">
            {#if viewerFeaturedMaps.length}
              {#each viewerFeaturedMaps as item (item.id)}
                <button
                  type="button"
                  class="map-card"
                  class:active={item.id === selectedMapId}
                  on:click={() => dispatch('selectMapById', item.id)}
                >
                  {#if item.thumbnail}
                    <img src={item.thumbnail} alt={`Preview of ${item.name}`} loading="lazy" />
                  {/if}
                  <div class="map-card-body">
                    <span class="map-card-title">{item.name}</span>
                    <span class="map-card-meta">{item.summary || item.type}</span>
                  </div>
                </button>
              {/each}
            {:else}
              <p class="empty-state">No featured maps yet.</p>
            {/if}
          </div>
        </div>
        <div class="section-block">
          <h3>Metadata</h3>
          {#if selectedMap}
            <p class="muted">View additional information about {selectedMap.name}.</p>
            <button type="button" class="chip ghost" on:click={() => dispatch('openMetadata')}>
              Open metadata
            </button>
          {:else}
            <p class="empty-state">Select a map to view its metadata.</p>
          {/if}
        </div>
        <div class="section-block">
          <h3>Basemap</h3>
          <div class="button-group">
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
        </div>
        <div class="section-block">
          <h3>More historical maps</h3>
          <details class="map-accordion">
            <summary>Browse catalog ({viewerAllMaps.length})</summary>
            <div class="catalog-filter">
              <label>
                <span>Filter by type</span>
                <select bind:value={mapTypeSelection}>
                  <option value="all">All maps ({mapList.length})</option>
                  {#each mapTypes as type}
                    <option value={type}>{type}</option>
                  {/each}
                </select>
              </label>
            </div>
            <div class="catalog-list custom-scrollbar">
              {#if viewerAllMaps.length}
                {#each viewerAllMaps as item (item.id)}
                  <button
                    type="button"
                    class="catalog-item"
                    class:active={item.id === selectedMapId}
                    on:click={() => dispatch('selectMapById', item.id)}
                  >
                    {#if item.thumbnail}
                      <img src={item.thumbnail} alt={`Preview of ${item.name}`} loading="lazy" />
                    {/if}
                    <div class="catalog-text">
                      <span class="catalog-title">{item.name}</span>
                      <span class="catalog-meta">{item.summary || item.type}</span>
                    </div>
                  </button>
                {/each}
              {:else}
                <p class="empty-state">Map catalog is loading…</p>
              {/if}
            </div>
          </details>
        </div>
      </div>
    {:else if activeViewerSection === 'control'}
      <div class="section-group">
    <div class="section-block">
      <h3>View mode</h3>
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
    </div>
    <div class="section-block">
      <h3>Opacity</h3>
      <div class="slider">
        <input type="range" min="0" max="1" step="0.05" bind:value={opacity} on:input={(e) => dispatch('handleOpacityInput', e.currentTarget.valueAsNumber)} />
        <span>{Math.round(opacity * 100)}%</span>
      </div>
    </div>
        <div class="section-block">
          <h3>Search</h3>
          <div class="search-row">
        <input
          type="text"
          placeholder="Search for a place or address"
          value={searchQuery}
          on:input={(event) => dispatch('queueSearch', event.currentTarget.value)}
        />
        <button type="button" class="chip ghost" on:click={() => dispatch('locateUser')} disabled={searchLoading}>
          Locate
        </button>
        <button type="button" class="chip ghost" on:click={() => dispatch('clearSearch')} disabled={!searchQuery && !searchResults.length}>
          Clear
        </button>
      </div>
      {#if searchLoading}
        <p class="muted">Searching…</p>
      {:else if searchNotice}
        <p class:errored={searchNoticeType === 'error'} class:success={searchNoticeType === 'success'}>
          {searchNotice}
        </p>
      {/if}
      {#if searchResults.length}
        <div class="search-results custom-scrollbar">
          {#each searchResults as result (result.display_name)}
            <div class="search-result">
              <button type="button" class="result-main" on:click={() => dispatch('zoomToSearchResult', result)}>
                <span class="result-title">{result.display_name}</span>
                {#if result.type}
                  <span class="result-type">{result.type}</span>
                {/if}
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
    {:else if activeViewerSection === 'story'}
      <div class="section-group">
        <div class="section-block">
          <h3>Feature stories</h3>
          <div class="story-grid">
            {#if visibleStoryScenes.length}
              {#each visibleStoryScenes.slice(0, 2) as scene, index (scene.id)}
                <div class="story-card">
                  <h4>{scene.title}</h4>
                  <p>{scene.details || 'No description yet.'}</p>
                  <div class="story-card-actions">
                    <button type="button" class="chip" on:click={() => dispatch('goToStoryScene', index)}>
                      View
                    </button>
                  </div>
                </div>
              {/each}
            {:else}
              <p class="empty-state">No stories captured yet. Switch to Creator to add one.</p>
            {/if}
          </div>
        </div>
        <div class="section-block">
          <div class="section-header">
            <h3>View all stories</h3>
            {#if visibleStoryScenes.length}
              <button type="button" class="chip ghost" on:click={() => dispatch('startStoryPresentation', 0)}>
                Present
              </button>
            {/if}
          </div>
          <div class="story-list custom-scrollbar">
            {#if visibleStoryScenes.length}
              {#each visibleStoryScenes as scene, index (scene.id)}
                <div class="story-row">
                  <div class="story-info">
                    <span class="story-title">{scene.title}</span>
                    <span class="story-meta">{scene.details || 'No description provided.'}</span>
                  </div>
                  <div class="story-row-actions">
                    <button type="button" class="chip ghost" on:click={() => dispatch('goToStoryScene', index)}>
                      View
                    </button>
                    <button type="button" class="chip ghost" on:click={() => dispatch('startStoryPresentation', index)}>
                      Play
                    </button>
                  </div>
                </div>
              {/each}
            {:else}
              <p class="empty-state">No story slides yet.</p>
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <div class="section-group">
        <div class="section-block">
          <h3>Share</h3>
          <p class="muted">Copy a link to this view to share it with your team.</p>
          <button type="button" class="chip" on:click={() => dispatch('copyShareLink')}>
            {shareCopied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
        <div class="section-block">
          <h3>Status</h3>
          <p class:errored={statusError}>{statusMessage}</p>
        </div>
        <div class="section-block">
          <h3>Settings</h3>
          <div class="button-stack">
            <button type="button" class="chip ghost" on:click={() => dispatch('toggleAppMode')}>
              Switch to {appMode === 'explore' ? 'Creator' : 'Viewer'}
            </button>
            <button type="button" class="chip danger" on:click={() => dispatch('handleClearState')}>
              Clear cached state
            </button>
          </div>
        </div>
      </div>
    {/if}
    </div>
  {/if}
</div>
<style>
.viewer-panel {
    position: fixed;
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom) + 1.4rem);
    transform: translateX(-50%);
    width: min(720px, calc(100% - 2rem));
    background: rgba(15, 23, 42, 0.88);
    border-radius: 1.2rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    backdrop-filter: blur(18px);
    box-shadow: 0 24px 48px rgba(2, 6, 23, 0.55);
    display: flex;
    flex-direction: column;
    z-index: 130;
    pointer-events: auto;
  }

  .viewer-panel.collapsed {
    padding-bottom: 0.75rem;
  }
  .viewer-tabs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.35rem;
    padding: 0.75rem 0.85rem 0;
  }

  .viewer-tabs button,
  .button-group button,
  .toggle-group button,
  .panel-card-section button,
  .story-card-actions button,
  .story-row-actions button,
  .modal-chip-group button,
  .toolbar-menu button {
    border: none;
    border-radius: 0.75rem;
    background: rgba(30, 64, 175, 0.28);
    color: inherit;
    padding: 0.55rem 0.75rem;
    font-size: 0.82rem;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.15s ease;
  }
  .viewer-tabs button.selected,
  .button-group button.selected,
  .toggle-group button.selected,
  .toolbar-menu button.selected {
    background: rgba(79, 70, 229, 0.85);
    box-shadow: 0 12px 32px rgba(67, 56, 202, 0.35);
  }
  .viewer-tabs button:hover,
  .button-group button:hover,
  .toggle-group button:hover,
  .toolbar-menu button:hover {
    transform: translateY(-1px);
  }
  .viewer-section {
    padding: 0.8rem 1rem 1rem;
    max-height: 420px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section-group {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section-block {
    background: rgba(15, 23, 42, 0.65);
    border-radius: 0.95rem;
    padding: 0.85rem 1rem;
    border: 1px solid rgba(148, 163, 184, 0.18);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .section-block h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .map-grid {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }
  .map-card {
    display: flex;
    flex-direction: column;
    border-radius: 0.85rem;
    background: rgba(30, 41, 59, 0.75);
    border: 1px solid transparent;
    overflow: hidden;
    text-align: left;
    gap: 0.45rem;
  }

  .map-card.active {
    border-color: rgba(99, 102, 241, 0.85);
    box-shadow: 0 16px 32px rgba(59, 130, 246, 0.35);
  }

  .map-card img {
    width: 100%;
    height: 110px;
    object-fit: cover;
  }
  .map-card-body {
    padding: 0 0.75rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .map-card-title {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .map-card-meta {
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.85);
  }
  .empty-state {
    margin: 0;
    font-size: 0.78rem;
    color: rgba(148, 163, 184, 0.8);
  }
  .muted {
    color: rgba(148, 163, 184, 0.8);
    font-size: 0.78rem;
  }
  .button-group {
    display: flex;
    gap: 0.5rem;
    flex-wrap: nowrap;
  }
  .map-accordion {
    border-radius: 0.85rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.5);
    padding: 0.6rem 0.75rem;
  }

  .map-accordion summary {
    cursor: pointer;
    font-weight: 600;
    list-style: none;
  }

  .map-accordion summary::-webkit-details-marker {
    display: none;
  }

  .map-accordion[open] summary {
    margin-bottom: 0.6rem;
  }
  .catalog-filter {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0.75rem;
  }

  .catalog-filter label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .catalog-filter select {
    padding: 0.35rem 0.55rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.65);
    color: inherit;
  }
  .catalog-list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    max-height: 240px;
    padding-right: 0.2rem;
  }
  .catalog-item {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    border-radius: 0.85rem;
    border: 1px solid transparent;
    background: rgba(15, 23, 42, 0.55);
    padding: 0.55rem 0.65rem;
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .catalog-item:hover,
  .catalog-item:focus-visible {
    border-color: rgba(99, 102, 241, 0.5);
    outline: none;
  }

  .catalog-item.active {
    border-color: rgba(99, 102, 241, 0.8);
    box-shadow: 0 12px 24px rgba(67, 56, 202, 0.35);
  }

  .catalog-item img {
    width: 48px;
    height: 48px;
    object-fit: cover;
    border-radius: 0.6rem;
    flex-shrink: 0;
  }
  .catalog-text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .catalog-title {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .catalog-meta {
    font-size: 0.72rem;
    color: rgba(148, 163, 184, 0.78);
  }
  .button-group.wrap {
    flex-wrap: wrap;
  }
  .slider {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .slider input[type='range'] {
    flex: 1 1 auto;
  }
  .search-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .search-row input {
    flex: 1 1 200px;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    padding: 0.55rem 0.75rem;
    background: rgba(15, 23, 42, 0.75);
    color: inherit;
  }
  .search-results {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    max-height: 220px;
    overflow-y: auto;
  }

  .search-result {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 0.75rem;
    border-radius: 0.8rem;
    background: rgba(30, 41, 59, 0.75);
  }
  .result-main {
    flex: 1 1 auto;
    text-align: left;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .result-title {
    font-size: 0.82rem;
    font-weight: 500;
  }

  .result-type {
    font-size: 0.72rem;
    color: rgba(148, 163, 184, 0.8);
  }
  .story-grid {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .story-card {
    border-radius: 0.85rem;
    background: rgba(30, 41, 59, 0.75);
    padding: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .story-card h4 {
    margin: 0;
  }

  .story-card p {
    margin: 0;
    font-size: 0.78rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .story-card-actions {
    margin-top: auto;
    display: flex;
    gap: 0.4rem;
  }
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }
  .story-list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    max-height: 220px;
    overflow-y: auto;
  }
  .story-row {
    display: flex;
    gap: 0.45rem;
    padding: 0.65rem 0.75rem;
    border-radius: 0.8rem;
    background: rgba(30, 41, 59, 0.75);
    align-items: center;
  }
  .story-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .story-title {
    font-weight: 500;
  }

  .story-meta {
    font-size: 0.72rem;
    color: rgba(148, 163, 184, 0.8);
  }

  .story-row-actions {
    display: flex;
    gap: 0.4rem;
  }
  .errored {
    color: #fca5a5;
  }

  .success {
    color: #86efac;
  }
</style>