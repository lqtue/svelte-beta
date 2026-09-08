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
    transition: all 0.1s;
  }

  .chunky-tab:hover {
    filter: brightness(0.95);
  }

  .chunky-tab.active {
    background: var(--tab-active-bg, var(--color-blue));
    color: var(--color-on-accent);
  }
</style>
