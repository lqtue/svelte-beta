<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TreasureHunt, HuntStop, StopInteraction } from './types';

  const dispatch = createEventDispatcher<{
    updateHunt: { title?: string; description?: string };
    updateStop: { stopId: string; updates: Partial<HuntStop> };
    removeStop: { stopId: string };
    selectStop: { stopId: string | null };
    zoomToStop: { stopId: string };
    zoomToAll: void;
    togglePlacing: void;
    exportHunt: void;
    importHunt: { data: TreasureHunt };
    close: void;
  }>();

  export let hunt: TreasureHunt | null = null;
  export let selectedStopId: string | null = null;
  export let placingStop = false;

  let importInputEl: HTMLInputElement | null = null;
  let expandedStopId: string | null = null;

  $: stops = hunt?.stops ?? [];

  function handleImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const [file] = input.files ?? [];
    if (!file) return;
    file.text().then((text) => {
      try {
        const data = JSON.parse(text) as TreasureHunt;
        if (!data.stops || !Array.isArray(data.stops)) throw new Error('Invalid hunt file');
        dispatch('importHunt', { data });
      } catch (e) {
        console.error('Hunt import failed', e);
      }
    });
    input.value = '';
  }

  function toggleExpanded(stopId: string) {
    expandedStopId = expandedStopId === stopId ? null : stopId;
    dispatch('selectStop', { stopId: expandedStopId });
  }
</script>

<aside class="panel">
  <header class="panel-header">
    <button type="button" class="panel-collapse" on:click={() => dispatch('close')}>
      Back to annotations
    </button>
    <div class="panel-controls">
      <h2 class="panel-heading">Treasure Hunt</h2>
      <div class="right-actions">
        <button type="button" class="chip ghost" on:click={() => dispatch('exportHunt')} disabled={!stops.length}>
          Export
        </button>
        <label class="chip ghost upload">
          Import
          <input type="file" accept=".json" on:change={handleImport} bind:this={importInputEl} />
        </label>
      </div>
    </div>
  </header>

  {#if hunt}
    <div class="hunt-meta">
      <input
        type="text"
        value={hunt.title}
        placeholder="Hunt title"
        on:input={(e) => dispatch('updateHunt', { title: (e.target as HTMLInputElement).value })}
      />
      <textarea
        rows="2"
        value={hunt.description}
        placeholder="Hunt description"
        on:input={(e) => dispatch('updateHunt', { description: (e.target as HTMLTextAreaElement).value })}
      ></textarea>
    </div>

    <div class="place-controls">
      <button
        type="button"
        class="chip"
        class:placing={placingStop}
        on:click={() => dispatch('togglePlacing')}
      >
        {placingStop ? 'Click map to place...' : 'Place stop'}
      </button>
      <button
        type="button"
        class="chip ghost"
        on:click={() => dispatch('zoomToAll')}
        disabled={!stops.length}
      >
        Zoom to all
      </button>
    </div>
  {/if}

  <div class="panel-body custom-scrollbar">
    {#if stops.length}
      {#each stops as stop (stop.id)}
        <div
          class="list-card"
          class:selected={stop.id === selectedStopId}
          on:click={() => toggleExpanded(stop.id)}
          on:keydown={(e) => { if (e.key === 'Enter') toggleExpanded(stop.id); }}
          role="button"
          tabindex="0"
        >
          <div class="list-card-header">
            <span class="stop-number">{stop.order + 1}</span>
            <input
              type="text"
              value={stop.title}
              placeholder="Stop title"
              on:input|stopPropagation={(e) => dispatch('updateStop', { stopId: stop.id, updates: { title: (e.target as HTMLInputElement).value } })}
              on:click|stopPropagation
            />
            <div class="list-card-actions">
              <button type="button" class="chip ghost small" on:click|stopPropagation={() => dispatch('zoomToStop', { stopId: stop.id })}>
                Zoom
              </button>
              <button type="button" class="chip danger small" on:click|stopPropagation={() => dispatch('removeStop', { stopId: stop.id })}>
                Delete
              </button>
            </div>
          </div>

          {#if expandedStopId === stop.id}
            <div class="stop-details" on:click|stopPropagation on:keydown|stopPropagation>
              <textarea
                rows="2"
                value={stop.description}
                placeholder="Description shown on arrival"
                on:input={(e) => dispatch('updateStop', { stopId: stop.id, updates: { description: (e.target as HTMLTextAreaElement).value } })}
              ></textarea>

              <div class="field-row">
                <label>
                  <span class="field-label">Radius (m)</span>
                  <input
                    type="number"
                    value={stop.triggerRadius}
                    min="5"
                    max="200"
                    on:input={(e) => dispatch('updateStop', { stopId: stop.id, updates: { triggerRadius: Number((e.target as HTMLInputElement).value) || 10 } })}
                  />
                </label>
                <label>
                  <span class="field-label">Trigger</span>
                  <select
                    value={stop.interaction}
                    on:change={(e) => dispatch('updateStop', { stopId: stop.id, updates: { interaction: (e.target as HTMLSelectElement).value as StopInteraction } })}
                  >
                    <option value="proximity">Proximity</option>
                    <option value="qr">QR Code</option>
                    <option value="camera">Camera</option>
                  </select>
                </label>
              </div>

              <label>
                <span class="field-label">Hint (shown before arrival)</span>
                <input
                  type="text"
                  value={stop.hint ?? ''}
                  placeholder="Optional hint"
                  on:input={(e) => dispatch('updateStop', { stopId: stop.id, updates: { hint: (e.target as HTMLInputElement).value || undefined } })}
                />
              </label>

              <label>
                <span class="field-label">Quest (task on arrival)</span>
                <input
                  type="text"
                  value={stop.quest ?? ''}
                  placeholder="Optional quest"
                  on:input={(e) => dispatch('updateStop', { stopId: stop.id, updates: { quest: (e.target as HTMLInputElement).value || undefined } })}
                />
              </label>

              <label>
                <span class="field-label">Overlay map ID (Allmaps)</span>
                <input
                  type="text"
                  value={stop.overlayMapId ?? ''}
                  placeholder="Paste Allmaps annotation ID"
                  on:input={(e) => dispatch('updateStop', { stopId: stop.id, updates: { overlayMapId: (e.target as HTMLInputElement).value || undefined } })}
                />
              </label>

              <div class="coords-display">
                {stop.coordinates[1].toFixed(6)}, {stop.coordinates[0].toFixed(6)}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    {:else}
      <p class="empty-state">Click "Place stop" and then click on the map to add stops.</p>
    {/if}
  </div>
</aside>

<style>
  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.95) 0%, rgba(232, 213, 186, 0.95) 100%);
    border: 2px solid #d4af37;
    border-radius: 4px;
    padding: 0.9rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    backdrop-filter: blur(12px);
    height: 100%;
    max-height: none;
    overflow: hidden;
    min-width: 0;
    color: #2b2520;
  }

  .panel-header {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .panel-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
    justify-content: space-between;
  }

  .panel-heading {
    margin: 0;
    font-family: 'Spectral', serif;
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #2b2520;
  }

  .panel-collapse {
    align-self: flex-start;
    border: 1px solid rgba(212, 175, 55, 0.4);
    background: rgba(255, 255, 255, 0.5);
    border-radius: 2px;
    color: #6b5d52;
    font-size: 0.72rem;
    padding: 0.25rem 0.8rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .panel-collapse:hover,
  .panel-collapse:focus-visible {
    background: rgba(212, 175, 55, 0.2);
    border-color: #d4af37;
    outline: none;
  }

  .panel-body {
    margin-top: 0.25rem;
    padding-right: 0.2rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    flex: 1;
  }

  .hunt-meta {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .hunt-meta input,
  .hunt-meta textarea {
    border-radius: 2px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    background: rgba(255, 255, 255, 0.6);
    color: #2b2520;
    padding: 0.45rem 0.6rem;
    font-family: inherit;
  }

  .hunt-meta textarea {
    resize: vertical;
    min-height: 40px;
  }

  .place-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .chip {
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 2px;
    padding: 0.35rem 0.65rem;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
    background: rgba(255, 255, 255, 0.5);
    color: #4a3f35;
  }

  .chip.placing {
    background: rgba(212, 175, 55, 0.3);
    border-color: #d4af37;
    color: #2b2520;
    font-weight: 600;
  }

  .chip.ghost {
    background: rgba(255, 255, 255, 0.5);
    color: #4a3f35;
  }

  .chip.ghost:hover {
    background: rgba(212, 175, 55, 0.2);
    border-color: rgba(212, 175, 55, 0.6);
  }

  .chip.ghost:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .chip.danger {
    background: rgba(168, 72, 72, 0.12);
    border-color: rgba(168, 72, 72, 0.3);
    color: #a84848;
  }

  .chip.danger:hover {
    background: rgba(168, 72, 72, 0.2);
    border-color: rgba(168, 72, 72, 0.5);
  }

  .chip.small {
    padding: 0.2rem 0.45rem;
    font-size: 0.7rem;
  }

  .right-actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  .upload {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }

  .upload input {
    display: none;
  }

  .list-card {
    position: relative;
    border-radius: 4px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    background: rgba(255, 255, 255, 0.4);
    padding: 0.75rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    cursor: pointer;
  }

  .list-card.selected {
    border-color: #d4af37;
    background: rgba(212, 175, 55, 0.12);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .list-card-header {
    display: flex;
    gap: 0.55rem;
    align-items: center;
  }

  .stop-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #d4af37;
    color: #fff;
    font-size: 0.72rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .list-card-header input[type='text'] {
    flex: 1 1 auto;
    border-radius: 2px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    background: rgba(255, 255, 255, 0.6);
    color: #2b2520;
    padding: 0.35rem 0.5rem;
    font-size: 0.82rem;
  }

  .list-card-actions {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-shrink: 0;
  }

  .stop-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.25rem;
  }

  .stop-details textarea {
    border-radius: 2px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    background: rgba(255, 255, 255, 0.5);
    color: #2b2520;
    padding: 0.45rem 0.6rem;
    resize: vertical;
    min-height: 48px;
    font-family: inherit;
    font-size: 0.8rem;
  }

  .stop-details input,
  .stop-details select {
    border-radius: 2px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    background: rgba(255, 255, 255, 0.5);
    color: #2b2520;
    padding: 0.35rem 0.5rem;
    font-family: inherit;
    font-size: 0.8rem;
  }

  .field-row {
    display: flex;
    gap: 0.6rem;
  }

  .field-row label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .field-label {
    font-size: 0.68rem;
    color: #6b5d52;
    font-weight: 600;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .coords-display {
    font-size: 0.68rem;
    color: #8b7355;
    font-family: monospace;
  }

  .empty-state {
    margin: 0;
    font-size: 0.78rem;
    color: #8b7355;
  }

  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(212, 175, 55, 0.4) transparent;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(212, 175, 55, 0.4);
    border-radius: 999px;
  }
</style>
