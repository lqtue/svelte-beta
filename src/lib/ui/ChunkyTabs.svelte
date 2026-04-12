<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  /** Each tab: { value: string; label: string } — label may include emoji. */
  export let tabs: { value: string; label: string }[];
  /** The currently active value. Two-way bindable via on:change. */
  export let active: string;
  /** Active tab background color. Defaults to blue; pass var(--color-purple) for catalog. */
  export let activeColor: string = 'var(--color-blue)';

  const dispatch = createEventDispatcher<{ change: string }>();
</script>

<div class="chunky-tabs" style="--tab-active-bg: {activeColor}">
  {#each tabs as tab (tab.value)}
    <button
      class="chunky-tab"
      class:active={active === tab.value}
      on:click={() => dispatch('change', tab.value)}
    >
      {tab.label}
    </button>
  {/each}
</div>

<style>
  .chunky-tabs {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .chunky-tab {
    padding: 0.75rem 1.5rem;
    font-family: var(--font-family-display);
    font-size: 1rem;
    font-weight: 700;
    background: var(--color-white);
    border: var(--border-thick);
    border-radius: var(--radius-md);
    cursor: pointer;
    box-shadow: var(--shadow-solid-sm);
    transition: all 0.1s;
  }

  .chunky-tab:hover {
    transform: translateY(-2px);
    box-shadow: 4px 4px 0px var(--color-border);
  }

  .chunky-tab.active {
    background: var(--tab-active-bg, var(--color-blue));
    color: white;
    transform: translate(2px, 2px);
    box-shadow: 0 0 0 var(--color-border);
  }

  /* Archival theme */
  :global([data-theme="archival"]) .chunky-tab {
    border: var(--border-thin);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-solid-sm);
    font-weight: 600;
  }
  :global([data-theme="archival"]) .chunky-tab:hover {
    transform: none;
    box-shadow: var(--shadow-solid);
  }
  :global([data-theme="archival"]) .chunky-tab.active {
    background: var(--tab-active-bg, var(--color-blue));
    transform: none;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.15);
  }
</style>
