<!--
  SearchPanel.svelte — Unified search: Maps catalog + Location/Coordinates.
  Floating panel (not a full modal). Two tabs: Maps, Location.

  This component owns only the shell — backdrop, tab bar, close button — and
  delegates each tab to SearchMapsTab / SearchLocationTab. Styles live in
  $styles/components/search-panel.css.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { SearchResult } from '$lib/map/types';
  import type { MapListItem } from '$lib/data/maps/types';
  import SearchMapsTab from './SearchMapsTab.svelte';
  import SearchLocationTab from './SearchLocationTab.svelte';
  import '$styles/components/search-panel.css';

  const dispatch = createEventDispatcher<{
    close: void;
    navigate: { result: SearchResult };
    selectMap: { map: MapListItem };
    addToAnnotations: { result: SearchResult };
    addAsPoint: { result: SearchResult };
  }>();

  export let open = false;
  export let maps: MapListItem[] = [];
  export let selectedMapId: string | null = null;
  /** When true, show 'Add as point' on location results */
  export let showAddAsPoint = false;
  /** When true, hide the Location tab and only show map list */
  export let mapsOnly = false;
  /** When false, hide the layer-stack compare button. */
  export let showCompare = true;

  let activeTab: 'maps' | 'location' = 'maps';

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch('close');
    }
  }

  function handleBackdropClick() {
    dispatch('close');
  }
</script>

{#if open}
  <div class="search-backdrop" on:click={handleBackdropClick} role="presentation"></div>
  <div
    class="search-panel"
    role="dialog"
    aria-label="Search"
    tabindex="-1"
    on:keydown={handleKeydown}
  >
    <!-- Tab bar (hidden when mapsOnly) -->
    {#if !mapsOnly}
      <div class="tab-bar">
        <button
          type="button"
          class="tb"
          class:active={activeTab === 'maps'}
          on:click={() => (activeTab = 'maps')}>Maps</button
        >
        <button
          type="button"
          class="tb"
          class:active={activeTab === 'location'}
          on:click={() => (activeTab = 'location')}>Location</button
        >
        <div class="tab-spacer"></div>
        <button
          type="button"
          class="close-btn"
          on:click={() => dispatch('close')}
          aria-label="Close search"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg
          >
        </button>
      </div>
    {:else}
      <div class="tab-bar maps-only-header">
        <div class="tab-spacer"></div>
        <button
          type="button"
          class="close-btn"
          on:click={() => dispatch('close')}
          aria-label="Close search"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg
          >
        </button>
      </div>
    {/if}

    {#if mapsOnly || activeTab === 'maps'}
      <SearchMapsTab
        {maps}
        {selectedMapId}
        {showCompare}
        on:selectMap={(e) => {
          dispatch('selectMap', e.detail);
          dispatch('close');
        }}
      />
    {:else if activeTab === 'location'}
      <SearchLocationTab
        {maps}
        {selectedMapId}
        {showAddAsPoint}
        on:navigate={(e) => dispatch('navigate', e.detail)}
        on:selectMap={(e) => dispatch('selectMap', e.detail)}
        on:addAsPoint={(e) => dispatch('addAsPoint', e.detail)}
        on:close={() => dispatch('close')}
      />
    {/if}
  </div>
{/if}
