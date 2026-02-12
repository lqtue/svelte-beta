<!--
  MapToolbar.svelte — shared bottom toolbar for View, Create, and Annotate modes.
  Compact bar: clickable view-mode label (cycles on click) + opacity slider.
-->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { ViewMode } from "$lib/viewer/types";

  export let viewMode: ViewMode;
  export let opacity: number;
  export let isMobile = false;

  /** Expose root element so parents can pass it to MapSearchBar */
  export let toolbarEl: HTMLDivElement | undefined = undefined;

  const dispatch = createEventDispatcher<{
    changeViewMode: { mode: ViewMode };
    changeOpacity: { value: number };
  }>();

  const viewModes: { mode: ViewMode; label: string }[] = [
    { mode: "overlay", label: "Overlay" },
    { mode: "side-x", label: "Side X" },
    { mode: "side-y", label: "Side Y" },
    { mode: "spy", label: "Lens" },
  ];

  $: currentIndex = viewModes.findIndex((v) => v.mode === viewMode);
  $: currentLabel = viewModes[currentIndex]?.label ?? "Overlay";

  function cycleViewMode() {
    const next = (currentIndex + 1) % viewModes.length;
    dispatch("changeViewMode", { mode: viewModes[next].mode });
  }

  function handleOpacity(event: Event) {
    const val = parseFloat((event.target as HTMLInputElement).value);
    dispatch("changeOpacity", { value: val });
  }
</script>

<div class="map-toolbar" class:mobile={isMobile} bind:this={toolbarEl}>
  <button
    type="button"
    class="view-cycle"
    on:click={cycleViewMode}
    title="Click to change view mode"
  >
    <span class="view-label">View</span>
    <span class="view-value">{currentLabel}</span>
  </button>

  <div class="toolbar-sep"></div>

  <div class="opacity-group">
    <input
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={opacity}
      on:input={handleOpacity}
      class="toolbar-slider"
    />
    <span class="opacity-val">{Math.round(opacity * 100)}%</span>
  </div>
</div>

<style>
  .map-toolbar {
    position: absolute;
    bottom: calc(env(safe-area-inset-bottom) + 1.5rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--color-white);
    border: var(--border-thick);
    border-radius: var(--radius-pill);
    padding: 0.35rem 0.75rem;
    box-shadow: var(--shadow-solid);
    pointer-events: auto;
  }

  .map-toolbar.mobile {
    bottom: calc(env(safe-area-inset-bottom) + 3.5rem);
  }

  /* ── View cycle button ─────────────────────────────────────── */
  .view-cycle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    border: none;
    background: none;
    cursor: pointer;
    padding: 0.25rem 0.35rem;
    border-radius: var(--radius-sm);
    transition: background 0.1s;
  }

  .view-cycle:hover {
    background: var(--color-gray-100);
  }

  .view-cycle:active {
    background: var(--color-gray-300);
  }

  .view-label {
    font-family: var(--font-family-display);
    font-size: 0.6rem;
    font-weight: 800;
    text-transform: uppercase;
    color: var(--color-text);
    opacity: 0.5;
    letter-spacing: 0.04em;
  }

  .view-value {
    font-family: var(--font-family-base);
    font-weight: 700;
    font-size: 0.8rem;
    color: var(--color-text);
  }

  /* ── Separator ─────────────────────────────────────────────── */
  .toolbar-sep {
    width: 2px;
    height: 20px;
    background: var(--color-gray-300);
    flex-shrink: 0;
  }

  /* ── Opacity slider ────────────────────────────────────────── */
  .opacity-group {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .toolbar-slider {
    width: 72px;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--color-gray-300);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .toolbar-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--color-blue);
    border: 2px solid var(--color-white);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    cursor: pointer;
  }

  .toolbar-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--color-blue);
    border: 2px solid var(--color-white);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    cursor: pointer;
  }

  .opacity-val {
    font-family: var(--font-family-display);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--color-text);
    min-width: 2.25rem;
    text-align: right;
  }
</style>
