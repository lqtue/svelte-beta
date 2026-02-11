<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { MapListItem } from '$lib/viewer/types';

  const dispatch = createEventDispatcher<{ close: void }>();

  export let open = false;
  export let selectedMap: MapListItem | null = null;

  let overlayEl: HTMLDivElement | null = null;

  $: if (open && overlayEl) {
    overlayEl.focus();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch('close');
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target === overlayEl) {
      event.preventDefault();
      dispatch('close');
    }
  }
</script>

{#if open}
  <div
    class="metadata-overlay"
    role="dialog"
    aria-modal="true"
    tabindex="0"
    bind:this={overlayEl}
    on:keydown={handleKeydown}
  >
    <div class="metadata-card">
      <header>
        <h2>Map metadata</h2>
        <button type="button" class="chip ghost" on:click={() => dispatch('close')}>
          Close
        </button>
      </header>
      {#if selectedMap}
        <section class="metadata-section">
          <h3>{selectedMap.name}</h3>
          <dl>
            <div>
              <dt>Type</dt>
              <dd>{selectedMap.type}</dd>
            </div>
            {#if selectedMap.summary}
              <div>
                <dt>Summary</dt>
                <dd>{selectedMap.summary}</dd>
              </div>
            {/if}
            {#if selectedMap.description}
              <div>
                <dt>Details</dt>
                <dd>{selectedMap.description}</dd>
              </div>
            {/if}
          </dl>
        </section>
      {:else}
        <p class="empty-state">Select a map to view its metadata.</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .metadata-overlay {
    position: fixed;
    inset: 0;
    background: rgba(43, 37, 32, 0.6);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 110;
    padding: 1.5rem;
  }

  .metadata-card {
    width: min(420px, 100%);
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.98) 0%, rgba(232, 213, 186, 0.98) 100%);
    border-radius: 4px;
    border: 2px solid #d4af37;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
    padding: 1.1rem 1.3rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    color: #2b2520;
  }

  .metadata-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .metadata-card h2 {
    margin: 0;
    font-family: 'Spectral', serif;
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #2b2520;
  }

  .metadata-section h3 {
    margin: 0 0 0.5rem;
    font-family: 'Spectral', serif;
    font-size: 1.05rem;
    font-weight: 700;
    color: #2b2520;
  }

  .metadata-section dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .metadata-section dt {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b5d52;
    font-family: 'Be Vietnam Pro', sans-serif;
    font-weight: 600;
  }

  .metadata-section dd {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.4;
    color: #4a3f35;
  }

  .chip {
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 2px;
    padding: 0.35rem 0.65rem;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .chip.ghost {
    background: rgba(255, 255, 255, 0.5);
    color: #4a3f35;
  }

  .chip.ghost:hover {
    background: rgba(212, 175, 55, 0.2);
    border-color: rgba(212, 175, 55, 0.6);
  }

  .empty-state {
    margin: 0;
    font-size: 0.78rem;
    color: #8b7355;
  }
</style>
