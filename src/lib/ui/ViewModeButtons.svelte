<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ViewMode } from '$lib/viewer/types';

  const dispatch = createEventDispatcher<{
    change: { mode: ViewMode };
  }>();

  export let viewMode: ViewMode = 'overlay';
  export let compact: boolean = false;

  const modes: { mode: ViewMode; label: string; title: string }[] = [
    { mode: 'overlay', label: 'Overlay', title: 'Overlay' },
    { mode: 'side-x', label: 'Side-X', title: 'Side by side (horizontal)' },
    { mode: 'side-y', label: 'Side-Y', title: 'Side by side (vertical)' },
    { mode: 'spy', label: 'Glass', title: 'Spy glass' }
  ];
</script>

<div class="view-mode-buttons" class:compact>
  {#each modes as { mode, label, title }}
    <button
      type="button"
      class:selected={viewMode === mode}
      on:click={() => dispatch('change', { mode })}
      {title}
    >
      {#if compact}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          {#if mode === 'side-x'}
            <line x1="12" y1="3" x2="12" y2="21" />
          {:else if mode === 'side-y'}
            <line x1="3" y1="12" x2="21" y2="12" />
          {:else if mode === 'spy'}
            <circle cx="12" cy="12" r="5" />
          {/if}
        </svg>
      {:else}
        {label}
      {/if}
    </button>
  {/each}
</div>

<style>
  .view-mode-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .view-mode-buttons.compact {
    gap: 0.25rem;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 2px;
    padding: 0.25rem;
    flex-wrap: nowrap;
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

  .compact button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid transparent;
    background: transparent;
    color: #6b5d52;
  }

  .compact button svg {
    width: 18px;
    height: 18px;
  }

  button.selected {
    background: rgba(212, 175, 55, 0.3);
    border-color: #d4af37;
    color: #2b2520;
    font-weight: 600;
  }

  .compact button.selected {
    border-color: rgba(212, 175, 55, 0.6);
    font-weight: normal;
  }

  button:hover {
    background: rgba(212, 175, 55, 0.15);
    border-color: rgba(212, 175, 55, 0.6);
  }

  .compact button:hover {
    color: #4a3f35;
  }
</style>
