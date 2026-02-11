<!--
  LabelSidebar.svelte — Right panel for Label Studio.
  Shows legend items (available labels) and placed labels for the current task.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { LabelPin } from './types';

  const dispatch = createEventDispatcher<{
    selectLabel: { label: string };
    removePin: { pinId: string };
    submit: void;
  }>();

  export let legendItems: string[] = [];
  export let selectedLabel: string | null = null;
  export let placedPins: LabelPin[] = [];

  function selectLabel(label: string) {
    selectedLabel = label;
    dispatch('selectLabel', { label });
  }
</script>

<aside class="sidebar">
  <section class="sidebar-section">
    <h3 class="section-title">Legend</h3>
    <p class="section-hint">Select a label, then click on the map image to place it.</p>
    <div class="legend-list">
      {#each legendItems as item}
        <button
          type="button"
          class="legend-item"
          class:selected={item === selectedLabel}
          on:click={() => selectLabel(item)}
        >
          {item}
        </button>
      {/each}
      {#if !legendItems.length}
        <p class="empty-state">No legend items for this task.</p>
      {/if}
    </div>
  </section>

  <section class="sidebar-section">
    <h3 class="section-title">Placed Labels ({placedPins.length})</h3>
    <div class="pin-list custom-scrollbar">
      {#each placedPins as pin (pin.id)}
        <div class="pin-item">
          <span class="pin-label">{pin.label}</span>
          <span class="pin-coords">({Math.round(pin.pixelX)}, {Math.round(pin.pixelY)})</span>
          <button
            type="button"
            class="pin-remove"
            on:click={() => dispatch('removePin', { pinId: pin.id })}
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
      on:click={() => dispatch('submit')}
    >
      Submit Labels
    </button>
  </div>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.95) 0%, rgba(232, 213, 186, 0.95) 100%);
    border-left: 1px solid rgba(212, 175, 55, 0.3);
    padding: 1rem;
    height: 100%;
    overflow: hidden;
    color: #2b2520;
    font-family: 'Be Vietnam Pro', sans-serif;
  }

  .sidebar-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-title {
    margin: 0;
    font-family: 'Spectral', serif;
    font-size: 0.95rem;
    font-weight: 700;
    color: #2b2520;
  }

  .section-hint {
    margin: 0;
    font-size: 0.72rem;
    color: #8b7355;
  }

  .legend-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .legend-item {
    padding: 0.3rem 0.6rem;
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.5);
    color: #4a3f35;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .legend-item:hover {
    background: rgba(212, 175, 55, 0.1);
    border-color: rgba(212, 175, 55, 0.5);
  }

  .legend-item.selected {
    background: rgba(212, 175, 55, 0.25);
    border-color: #d4af37;
    font-weight: 600;
  }

  .pin-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 300px;
    overflow-y: auto;
    flex: 1;
  }

  .pin-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.5rem;
    background: rgba(255, 255, 255, 0.4);
    border-radius: 2px;
    border: 1px solid rgba(212, 175, 55, 0.2);
  }

  .pin-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: #2b2520;
    flex: 1;
  }

  .pin-coords {
    font-size: 0.65rem;
    color: #8b7355;
    font-family: monospace;
  }

  .pin-remove {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: #a84848;
    font-size: 1rem;
    cursor: pointer;
    border-radius: 2px;
    transition: background 0.15s ease;
  }

  .pin-remove:hover {
    background: rgba(168, 72, 72, 0.15);
  }

  .sidebar-footer {
    margin-top: auto;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(212, 175, 55, 0.3);
  }

  .submit-btn {
    width: 100%;
    padding: 0.5rem 1rem;
    border: 1px solid #d4af37;
    border-radius: 3px;
    background: #d4af37;
    color: #fff;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .submit-btn:hover:not(:disabled) {
    background: #b8942f;
  }

  .submit-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .empty-state {
    margin: 0;
    font-size: 0.72rem;
    color: #8b7355;
  }

  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(212, 175, 55, 0.4) transparent;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(212, 175, 55, 0.4);
    border-radius: 999px;
  }
</style>
