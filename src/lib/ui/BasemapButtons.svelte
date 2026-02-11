<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { BASEMAP_DEFS, type BasemapDefinition } from '$lib/viewer/constants';

  const dispatch = createEventDispatcher<{
    change: { key: string };
  }>();

  export let selected: string = 'g-streets';
  export let definitions: BasemapDefinition[] = BASEMAP_DEFS;
</script>

<div class="basemap-buttons">
  {#each definitions as base}
    <button
      type="button"
      class:selected={selected === base.key}
      on:click={() => dispatch('change', { key: base.key })}
    >
      {base.label}
    </button>
  {/each}
</div>

<style>
  .basemap-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  button {
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.5);
    color: #4a3f35;
    padding: 0.55rem 0.75rem;
    font-size: 0.82rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  button.selected {
    background: rgba(212, 175, 55, 0.3);
    border-color: #d4af37;
    color: #2b2520;
    font-weight: 600;
  }

  button:hover {
    background: rgba(212, 175, 55, 0.15);
    border-color: rgba(212, 175, 55, 0.6);
    transform: translateY(-1px);
  }
</style>
