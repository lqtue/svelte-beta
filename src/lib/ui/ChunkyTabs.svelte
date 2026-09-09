<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  /** Each tab: { value: string; label: string } — label may include emoji. */
  export let tabs: { value: string; label: string }[];
  /** The currently active value. Two-way bindable via on:change. */
  export let active: string;

  const dispatch = createEventDispatcher<{ change: string }>();
</script>

<div class="chunky-tabs">
  {#each tabs as tab (tab.value)}
    <button
      class="chip"
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

  /* The shared pill at page scale, through its own `--btn-*` knobs: a tab strip
     is a page-level control, not row chrome. Every face — rest, hover, the
     filled `.active`, focus — comes from components/buttons.css; the private
     `.chunky-tab` rules that used to live here were a fifth copy of the pill,
     and its `activeColor` prop had no caller. */
  .chip {
    --btn-text: 1rem;
    --btn-pad: 0.75rem 1.5rem;
  }
</style>
