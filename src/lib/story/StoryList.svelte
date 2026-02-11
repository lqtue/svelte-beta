<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TreasureHunt, HuntProgress } from './types';

  const dispatch = createEventDispatcher<{
    select: { hunt: TreasureHunt };
    import: { data: TreasureHunt };
  }>();

  export let hunts: TreasureHunt[] = [];
  export let progress: Record<string, HuntProgress> = {};

  let importInputEl: HTMLInputElement | null = null;

  function handleImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const [file] = input.files ?? [];
    if (!file) return;
    file.text().then((text) => {
      try {
        const data = JSON.parse(text) as TreasureHunt;
        if (!data.stops || !Array.isArray(data.stops)) throw new Error('Invalid hunt file');
        dispatch('import', { data });
      } catch (e) {
        console.error('Hunt import failed', e);
      }
    });
    input.value = '';
  }

  function getProgressLabel(huntId: string, totalStops: number): string {
    const p = progress[huntId];
    if (!p) return 'Not started';
    if (p.completedAt) return 'Completed';
    return `${p.completedStops.length} / ${totalStops} stops`;
  }
</script>

<div class="hunt-list-page">
  <div class="hunt-list-header">
    <h1 class="title">Treasure Hunts</h1>
    <label class="chip ghost upload">
      Import Hunt
      <input type="file" accept=".json" on:change={handleImport} bind:this={importInputEl} />
    </label>
  </div>

  {#if hunts.length}
    <div class="hunt-grid">
      {#each hunts as hunt (hunt.id)}
        <button
          type="button"
          class="hunt-card"
          on:click={() => dispatch('select', { hunt })}
        >
          <h2 class="hunt-name">{hunt.title}</h2>
          {#if hunt.description}
            <p class="hunt-desc">{hunt.description}</p>
          {/if}
          <div class="hunt-meta">
            <span class="stop-count">{hunt.stops.length} stop{hunt.stops.length !== 1 ? 's' : ''}</span>
            <span class="hunt-progress">{getProgressLabel(hunt.id, hunt.stops.length)}</span>
          </div>
        </button>
      {/each}
    </div>
  {:else}
    <div class="empty">
      <p>No hunts yet. Create one in the <a href="/temp-viewer">Studio</a> or import a JSON file.</p>
    </div>
  {/if}
</div>

<style>
  .hunt-list-page {
    max-width: 640px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }

  .hunt-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }

  .title {
    margin: 0;
    font-family: 'Spectral', serif;
    font-size: 1.6rem;
    font-weight: 800;
    color: #2b2520;
  }

  .hunt-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .hunt-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.1rem 1.3rem;
    background: rgba(255, 255, 255, 0.5);
    border: 2px solid rgba(212, 175, 55, 0.3);
    border-radius: 4px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
    width: 100%;
    color: #2b2520;
  }

  .hunt-card:hover {
    border-color: #d4af37;
    background: rgba(212, 175, 55, 0.1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .hunt-name {
    margin: 0;
    font-family: 'Spectral', serif;
    font-size: 1.1rem;
    font-weight: 700;
  }

  .hunt-desc {
    margin: 0;
    font-size: 0.82rem;
    color: #6b5d52;
    line-height: 1.4;
  }

  .hunt-meta {
    display: flex;
    gap: 1rem;
    align-items: center;
    font-size: 0.72rem;
    color: #8b7355;
  }

  .stop-count {
    background: rgba(212, 175, 55, 0.15);
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
  }

  .hunt-progress {
    font-weight: 600;
  }

  .empty {
    text-align: center;
    padding: 3rem 1rem;
    color: #8b7355;
    font-size: 0.88rem;
  }

  .empty a {
    color: #d4af37;
    text-decoration: underline;
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

  .upload {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }

  .upload input {
    display: none;
  }
</style>
