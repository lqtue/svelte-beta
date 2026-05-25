<!--
  CatalogSidebarPanel — single-search browse panel.
  One input drives both the catalog filter (by map title) and an inline
  "Places" suggestion list (Nominatim) above the table.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CatalogUnifiedSearch from './CatalogUnifiedSearch.svelte';
  import LocationSearch from './LocationSearch.svelte';

  export let role: 'user' | 'mod' | 'admin' = 'user';
  /** Show place-name suggestions (Nominatim). Disable on /image. */
  export let showLocation: boolean = true;
  /** Highlight this row in the table. */
  export let activeId: string | null = null;
  /** Hide image-only entries. */
  export let requireGeoref: boolean = false;
  /** Show layer-action toggles (B / +) on each row. */
  export let showLayerActions: boolean = false;

  const dispatch = createEventDispatcher<{
    pick: any;
    pickLocation: { lat: number; lng: number; label: string; bbox?: [number, number, number, number] };
  }>();
  let searchQuery = '';
</script>

<div class="csp">
  <div class="csp-sticky">
    <div class="csp-heading">Browse the archive</div>

    <div class="csp-search">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
    <input type="text" placeholder="Search maps…" bind:value={searchQuery} />
    </div>
  </div>

  {#if showLocation}
    <LocationSearch query={searchQuery} on:pickLocation={(e) => dispatch('pickLocation', e.detail)} />
  {/if}

  <CatalogUnifiedSearch
    bind:searchQuery
    {role}
    {activeId}
    {requireGeoref}
    {showLayerActions}
    pickMode={true}
    compact={true}
    on:pick={(e) => dispatch('pick', e.detail)}
  />
</div>

<style>
  .csp { display: flex; flex-direction: column; gap: 0.5rem; padding: 0 0.6rem 0.8rem; }
  .csp-sticky {
    position: sticky; top: 0; z-index: 5;
    display: flex; flex-direction: column; gap: 0.4rem;
    padding: 0.6rem 0 0.5rem;
    background: var(--color-bg, #f5f0ea);
  }
  .csp-heading {
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 800; font-size: 0.78rem;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: #555;
    padding: 0.1rem;
    display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap;
  }
  .csp-sub {
    font-family: 'Outfit', sans-serif;
    font-size: 0.66rem; font-weight: 500;
    text-transform: none; letter-spacing: 0;
    color: #888;
  }
  .csp-search {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.45rem 0.7rem;
    background: #fff;
    border: 1.5px solid #111; border-radius: 999px;
  }
  .csp-search svg { width: 14px; height: 14px; color: #111; flex-shrink: 0; }
  .csp-search input {
    flex: 1; min-width: 0; border: none; outline: none; background: transparent;
    font: inherit; font-family: 'Outfit', sans-serif; font-size: 0.85rem;
  }
</style>
