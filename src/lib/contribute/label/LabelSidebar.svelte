<!--
  LabelSidebar.svelte — Right panel for Label Studio.
  Shows legend items (available labels) and placed labels for the current task.
-->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import "$lib/styles/components/label.css";
  import type { LabelPin, FeatureType } from "./types";
  import { FEATURE_TYPE_LABELS, geometryKind } from "./types";

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
    selectFeatureType: { featureType: FeatureType };
    removePin: { pinId: string };
    submit: void;
  }>();

  export let legendItems: any[] = []; // string[] or { val: string; label: string }[]
  export let selectedLabel: string | null = null;
  export let placedPins: LabelPin[] = [];
  export let drawMode: 'pin' | 'trace' = 'pin';
  export let featureType: FeatureType = 'building';

  const FEATURE_ICONS: Record<FeatureType, string> = {
    building: '🏛',
    land_plot: '⬛',
    road: '🛣',
    waterway: '🌊',
    other: '⬡',
  };

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

  {#if drawMode === 'pin'}
    <!-- PIN MODE: legend list to select and place -->
    <section class="sidebar-section legend-section">
      <h3 class="section-title">Legend</h3>
      <p class="section-hint">
        Select a label, then click on the map to place it.
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

  {:else}
    <!-- TRACE MODE: feature type selector + context-aware label list -->
    <section class="sidebar-section">
      <h3 class="section-title">Feature Type</h3>
      <div class="feature-type-grid">
        {#each Object.entries(FEATURE_TYPE_LABELS) as [ft, label]}
          <button
            type="button"
            class="feature-type-btn"
            class:active={featureType === ft}
            on:click={() => dispatch('selectFeatureType', { featureType: ft as FeatureType })}
            title="{label} ({geometryKind(ft as FeatureType)})"
          >
            <span class="ft-icon">{FEATURE_ICONS[ft as FeatureType]}</span>
            <span class="ft-label">{label}</span>
            <span class="ft-geom">{geometryKind(ft as FeatureType) === 'LineString' ? 'line' : 'area'}</span>
          </button>
        {/each}
      </div>
    </section>

    <section class="sidebar-section legend-section">
      {#if featureType === 'building'}
        <h3 class="section-title">Select Building</h3>
        <p class="section-hint">
          Select a pinned building, then draw its outline. Double-click to finish.
        </p>
        <div class="legend-list">
          {#each placedPins as pin (pin.id)}
            <button
              type="button"
              class="legend-item list-item"
              class:selected={pin.label === selectedLabel}
              on:click={() => selectLabel(pin.label)}
            >
              <span class="item-val">🏛</span>
              <span class="item-label">{pin.label}</span>
            </button>
          {/each}
          {#if !placedPins.length}
            <p class="empty-state">Pin buildings first (📍 Pin Names mode), then trace here.</p>
          {/if}
        </div>
      {:else}
        <h3 class="section-title">Draw {FEATURE_TYPE_LABELS[featureType]}</h3>
        <p class="section-hint">
          {#if geometryKind(featureType) === 'LineString'}
            Click to add points along the {FEATURE_TYPE_LABELS[featureType].toLowerCase()}. Double-click to finish the line.
          {:else}
            Click to trace the {FEATURE_TYPE_LABELS[featureType].toLowerCase()} outline. Double-click to close the shape.
          {/if}
        </p>
        <p class="section-hint">
          Optional label:
          <input
            type="text"
            class="label-input"
            placeholder="e.g. Rue Catinat"
            on:change={(e) => selectLabel((e.target as HTMLInputElement).value)}
          />
        </p>
      {/if}
    </section>
  {/if}

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
