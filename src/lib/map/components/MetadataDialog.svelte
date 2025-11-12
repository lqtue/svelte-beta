<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { MapListItem } from '$lib/viewer/types';

  export let metadataOverlayOpen = false;
  export let selectedMap: MapListItem | null = null;

  let metadataOverlayEl: HTMLDivElement | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  $: if (metadataOverlayOpen && metadataOverlayEl) {
    metadataOverlayEl.focus();
  }
</script>

<div
  class="metadata-overlay"
  role="dialog"
  aria-modal="true"
  tabindex="0"
  bind:this={metadataOverlayEl}
  on:keydown={(event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch('close');
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target === metadataOverlayEl) {
      event.preventDefault();
      dispatch('close');
    }
  }}
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

<style>
.metadata-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.78);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 110;
    padding: 1.5rem;
  }

  .metadata-card {
    width: min(420px, 100%);
    background: rgba(15, 23, 42, 0.92);
    border-radius: 1rem;
    border: 1px solid rgba(129, 140, 248, 0.3);
    box-shadow: 0 32px 64px rgba(2, 6, 23, 0.6);
    padding: 1.1rem 1.3rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .metadata-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .metadata-card h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .metadata-section h3 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
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
    color: rgba(148, 163, 184, 0.8);
  }

  .metadata-section dd {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.4;
  }

  .metadata-card .chip {
    align-self: flex-end;
  }
</style>
