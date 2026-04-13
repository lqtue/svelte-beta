<!--
  PinSidebar.svelte — Sidebar content for pin labeling mode.
  Shows legend selection (with search) and the list of placed pins.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import '$styles/components/label.css';
  import type { LabelPin } from '$lib/contribute/label/types';

  const dispatch = createEventDispatcher<{
    selectLabel: { label: string };
    removePin: { pinId: string };
  }>();

  export let legendItems: any[] = [];
  export let selectedLabel: string | null = null;
  export let placedPins: LabelPin[] = [];

  function getLabel(item: any) { return typeof item === 'string' ? item : item.label; }
  function getValue(item: any) { return typeof item === 'string' ? item : item.val; }
  function isMapped(item: any) {
    const val = getValue(item);
    if (typeof item !== 'string') return placedPins.some((p) => p.label === val);
    return false;
  }

  function pinDisplayName(pin: LabelPin): string {
    if (pin.data?.originalName) return pin.data.originalName;
    const item = legendItems.find((i: any) => (typeof i === 'string' ? i : i.val) === pin.label);
    if (item && typeof item !== 'string') return item.label;
    return pin.label;
  }

  let searchQuery = '';
  $: filteredItems = searchQuery.trim()
    ? legendItems.filter((item) => {
        const q = searchQuery.trim().toLowerCase();
        return getValue(item).toString().toLowerCase().includes(q) ||
               getLabel(item).toLowerCase().includes(q);
      })
    : legendItems;

  let legendOpen = true;
  let pinsOpen = true;
</script>

<div class="sidebar-content">
  <!-- Legend -->
  <section class="sidebar-section">
    <button type="button" class="section-toggle" on:click={() => (legendOpen = !legendOpen)}>
      <svg class="toggle-chevron" class:open={legendOpen} width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 4 10 8 6 12"/></svg>
      <h3 class="section-title">Legend</h3>
      <span class="section-count">{legendItems.length}</span>
    </button>
    {#if legendOpen}
      <p class="section-hint">Select a label, then click on the map to place it.</p>
      <div class="legend-search">
        <svg class="legend-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="7" cy="7" r="5"/><path d="M15 15l-3.5-3.5"/>
        </svg>
        <input type="text" class="legend-search-input" placeholder="Search…" bind:value={searchQuery} />
      </div>
      <div class="legend-list">
        {#each filteredItems as item}
          {@const val = getValue(item)}
          {@const label = getLabel(item)}
          {@const mapped = isMapped(item)}
          <button type="button" class="legend-item"
            class:list-item={typeof item !== 'string'}
            class:selected={val === selectedLabel}
            class:mapped
            on:click={() => !mapped && dispatch('selectLabel', { label: val })}
            disabled={mapped}
            title={mapped ? 'Already mapped' : label}
          >
            {#if typeof item !== 'string'}
              <span class="item-val">{val}</span>
              <span class="item-label">{label}</span>
            {:else}{item}{/if}
          </button>
        {/each}
        {#if !legendItems.length}
          <p class="empty-state">No legend items for this task.</p>
        {:else if !filteredItems.length}
          <p class="empty-state">No matches for "{searchQuery}"</p>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Placed pins -->
  <section class="sidebar-section">
    <button type="button" class="section-toggle" on:click={() => (pinsOpen = !pinsOpen)}>
      <svg class="toggle-chevron" class:open={pinsOpen} width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 4 10 8 6 12"/></svg>
      <h3 class="section-title">Placed Labels</h3>
      <span class="section-count">{placedPins.length}</span>
    </button>
    {#if pinsOpen}
      <div class="pin-list custom-scrollbar">
        {#each placedPins as pin (pin.id)}
          <div class="pin-item">
            <span class="pin-label">{pinDisplayName(pin)}</span>
            <span class="pin-coords">({Math.round(pin.pixelX)}, {Math.round(pin.pixelY)})</span>
            <button type="button" class="pin-remove"
              on:click={() => dispatch('removePin', { pinId: pin.id })}
              aria-label="Remove pin">&times;</button>
          </div>
        {/each}
        {#if !placedPins.length}
          <p class="empty-state">No labels placed yet.</p>
        {/if}
      </div>
    {/if}
  </section>
</div>

<style>
  .sidebar-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .section-toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: none;
    background: var(--color-white);
    cursor: pointer;
    border-bottom: var(--border-thin);
    transition: background 0.1s;
  }
  .section-toggle:hover { background: var(--color-gray-100); }
  .section-toggle .section-title {
    margin: 0;
    font-family: var(--font-family-base);
    font-size: 0.8rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-text);
  }
  .section-count {
    margin-left: auto;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--color-text);
    opacity: 0.4;
    background: var(--color-bg);
    padding: 0.1rem 0.4rem;
    border-radius: var(--radius-sm);
    border: var(--border-thin);
  }
  .toggle-chevron { flex-shrink: 0; opacity: 0.4; transition: transform 0.15s ease; }
  .toggle-chevron.open { transform: rotate(90deg); }
</style>
