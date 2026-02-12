<!--
  LabelSidebar.svelte — Right panel for Label Studio.
  Shows legend items (available labels) and placed labels for the current task.
-->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import "$lib/styles/components/label.css";
  import type { LabelPin } from "./types";

  // Helper to check if a legend item is already mapped
  function isMapped(item: any, pins: LabelPin[]) {
    const val = typeof item === "string" ? item : item.val;
    // For list items (objects), we map by value/ID. For categories (strings), we don't disable them.
    if (typeof item !== "string") {
      return pins.some((p) => p.label === val);
    }
    return false;
  }

  function getLabel(item: any) {
    return typeof item === "string" ? item : item.label;
  }

  function getValue(item: any) {
    return typeof item === "string" ? item : item.val;
  }

  const dispatch = createEventDispatcher<{
    selectLabel: { label: string };
    removePin: { pinId: string };
    submit: void;
  }>();

  export let legendItems: any[] = []; // string[] or { val: string; label: string }[]
  export let selectedLabel: string | null = null;
  export let placedPins: LabelPin[] = [];

  let searchQuery = "";

  $: filteredItems = searchQuery.trim()
    ? legendItems.filter((item) => {
        const q = searchQuery.trim().toLowerCase();
        const val = getValue(item).toString().toLowerCase();
        const label = getLabel(item).toLowerCase();
        return val.includes(q) || label.includes(q);
      })
    : legendItems;

  function selectLabel(label: string) {
    selectedLabel = label;
    dispatch("selectLabel", { label });
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <a href="/" class="back-link small" title="Back to home">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 6l6-4.5L14 6v7.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 13.5V6z"/>
        <path d="M6 15V9h4v6"/>
      </svg>
    </a>
    <h3 class="sidebar-header-title">Label Studio</h3>
  </div>

  <section class="sidebar-section legend-section">
    <h3 class="section-title">Legend</h3>
    <p class="section-hint">
      Select a label, then click on the map image to place it.
    </p>
    <div class="legend-search">
      <svg class="legend-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="7" cy="7" r="5"/>
        <path d="M15 15l-3.5-3.5"/>
      </svg>
      <input
        type="text"
        class="legend-search-input"
        placeholder="Search by number or name..."
        bind:value={searchQuery}
      />
    </div>
    <div class="legend-list">
      {#each filteredItems as item}
        {@const val = getValue(item)}
        {@const label = getLabel(item)}
        {@const mapped = isMapped(item, placedPins)}
        <button
          type="button"
          class="legend-item"
          class:list-item={typeof item !== "string"}
          class:selected={val === selectedLabel}
          class:mapped
          on:click={() => !mapped && selectLabel(val)}
          disabled={mapped}
          title={mapped ? "Already mapped" : label}
        >
          {#if typeof item !== "string"}
            <span class="item-val">{val}</span>
            <span class="item-label">{label}</span>
          {:else}
            {item}
          {/if}
        </button>
      {/each}
      {#if !legendItems.length}
        <p class="empty-state">No legend items for this task.</p>
      {:else if !filteredItems.length}
        <p class="empty-state">No matches for "{searchQuery}"</p>
      {/if}
    </div>
  </section>

  <section class="sidebar-section">
    <h3 class="section-title">Placed Labels ({placedPins.length})</h3>
    <div class="pin-list custom-scrollbar">
      {#each placedPins as pin (pin.id)}
        <div class="pin-item">
          <span class="pin-label">{pin.label}</span>
          <span class="pin-coords"
            >({Math.round(pin.pixelX)}, {Math.round(pin.pixelY)})</span
          >
          <button
            type="button"
            class="pin-remove"
            on:click={() => dispatch("removePin", { pinId: pin.id })}
            aria-label="Remove pin"
          >
            &times;
          </button>
        </div>
      {/each}
      {#if !placedPins.length}
        <p class="empty-state">No labels placed yet.</p>
      {/if}
    </div>
  </section>

  <div class="sidebar-footer">
    <button
      type="button"
      class="submit-btn"
      disabled={placedPins.length === 0}
      on:click={() => dispatch("submit")}
    >
      Submit Labels
    </button>
  </div>
</aside>
