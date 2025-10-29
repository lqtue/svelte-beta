<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { BasemapDefinition } from '$lib/viewer/constants';

  export let basemaps: BasemapDefinition[] = [];
  export let selected = '';
  export let label = 'Basemap selection';

  const dispatch = createEventDispatcher<{ select: string }>();

  function handleSelect(key: string) {
    dispatch('select', key);
  }
</script>

<div class="basemap-buttons" role="group" aria-label={label}>
  {#each basemaps as basemap}
    <button
      type="button"
      class:selected={selected === basemap.key}
      aria-pressed={selected === basemap.key}
      on:click={() => handleSelect(basemap.key)}
    >
      {basemap.label}
    </button>
  {/each}
</div>

<style>
  .basemap-buttons {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  button {
    padding: 0.4rem 0.75rem;
    border-radius: 0.65rem;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(15, 23, 42, 0.8);
    color: inherit;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  button.selected {
    background: rgba(129, 140, 248, 0.35);
    border-color: rgba(129, 140, 248, 0.85);
  }
</style>
