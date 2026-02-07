<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { AnnotationSummary } from '$lib/viewer/types';

  const dispatch = createEventDispatcher<{
    select: { id: string };
    rename: { id: string; label: string };
    changeColor: { id: string; color: string };
    updateDetails: { id: string; details: string };
    toggleVisibility: { id: string };
    delete: { id: string };
    zoomTo: { id: string };
    clear: void;
    exportGeoJSON: void;
    importFile: { file: File };
    toggleCollapse: void;
  }>();

  export let annotations: AnnotationSummary[] = [];
  export let selectedAnnotationId: string | null = null;
  export let collapsed = false;

  let openAnnotationMenu: string | null = null;
  let geoJsonInputEl: HTMLInputElement | null = null;
  let notice: string | null = null;
  let noticeType: 'info' | 'error' | 'success' = 'info';

  export function setNotice(message: string | null, tone: 'info' | 'error' | 'success' = 'info') {
    notice = message;
    noticeType = tone;
  }

  function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const [file] = input.files ?? [];
    if (!file) return;
    dispatch('importFile', { file });
    input.value = '';
  }
</script>

{#if collapsed}
  <button type="button" class="panel-toggle" on:click={() => dispatch('toggleCollapse')}>
    Show panel
  </button>
{:else}
  <aside class="panel">
    <header class="panel-header">
      <button
        type="button"
        class="panel-collapse"
        on:click={() => dispatch('toggleCollapse')}
        aria-expanded={!collapsed}
      >
        Hide panel
      </button>
      <div class="panel-controls">
        <h2 class="panel-heading">Annotations</h2>
        <div class="right-actions">
          <button type="button" class="chip ghost" on:click={() => dispatch('clear')} disabled={!annotations.length}>
            Clear
          </button>
          <button type="button" class="chip ghost" on:click={() => dispatch('exportGeoJSON')} disabled={!annotations.length}>
            Export
          </button>
          <label class="chip ghost upload">
            Import
            <input type="file" accept="application/geo+json,.geojson,.json" on:change={handleFileChange} bind:this={geoJsonInputEl} />
          </label>
        </div>
      </div>
    </header>
    <div class="panel-body custom-scrollbar">
      {#if notice}
        <p class="notice" class:errored={noticeType === 'error'} class:success={noticeType === 'success'}>
          {notice}
        </p>
      {/if}
      {#if annotations.length}
        {#each annotations as annotation (annotation.id)}
          <div class="list-card" class:selected={annotation.id === selectedAnnotationId}>
            <div class="list-card-header">
              <input
                type="text"
                value={annotation.label}
                placeholder="Annotation name"
                on:input={(event) => dispatch('rename', { id: annotation.id, label: (event.target as HTMLInputElement).value })}
              />
              <div class="list-card-actions">
                <input
                  type="color"
                  value={annotation.color}
                  title="Annotation colour"
                  on:input={(event) => dispatch('changeColor', { id: annotation.id, color: (event.target as HTMLInputElement).value })}
                />
                <button type="button" class="chip ghost" on:click={() => dispatch('toggleVisibility', { id: annotation.id })}>
                  {annotation.hidden ? 'Show' : 'Hide'}
                </button>
                <button type="button" class="chip danger" on:click={() => dispatch('delete', { id: annotation.id })}>
                  Delete
                </button>
                <button
                  type="button"
                  class="icon-button"
                  on:click={() => (openAnnotationMenu = openAnnotationMenu === annotation.id ? null : annotation.id)}
                  aria-label="Annotation actions"
                >
                  &#x2630;
                </button>
              </div>
            </div>
            <textarea
              rows="2"
              value={annotation.details}
              placeholder="Annotation details"
              on:input={(event) => dispatch('updateDetails', { id: annotation.id, details: (event.target as HTMLTextAreaElement).value })}
            ></textarea>
            {#if openAnnotationMenu === annotation.id}
              <div class="card-menu">
                <button type="button" on:click={() => { dispatch('zoomTo', { id: annotation.id }); openAnnotationMenu = null; }}>
                  Zoom to
                </button>
                <button type="button" on:click={() => { dispatch('select', { id: annotation.id }); openAnnotationMenu = null; }}>
                  Select
                </button>
              </div>
            {/if}
          </div>
        {/each}
      {:else}
        <p class="empty-state">Draw or import annotations to see them here.</p>
      {/if}
    </div>
  </aside>
{/if}

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

  .panel-header .panel-collapse {
    align-self: flex-start;
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

  .panel-body {
    margin-top: 0.75rem;
    padding-right: 0.2rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .panel-collapse {
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

  .panel-toggle {
    position: absolute;
    top: 1rem;
    right: 1rem;
    border: 1px solid rgba(212, 175, 55, 0.5);
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.95) 0%, rgba(232, 213, 186, 0.95) 100%);
    border-radius: 2px;
    color: #4a3f35;
    font-size: 0.74rem;
    padding: 0.4rem 0.9rem;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    backdrop-filter: blur(12px);
    transition: all 0.15s ease;
    z-index: 95;
  }

  .panel-toggle:hover,
  .panel-toggle:focus-visible {
    background: rgba(212, 175, 55, 0.25);
    border-color: #d4af37;
    outline: none;
  }

  .right-actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
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

  .upload {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }

  .upload input {
    display: none;
  }

  .icon-button {
    border: 1px solid rgba(212, 175, 55, 0.3);
    background: rgba(255, 255, 255, 0.4);
    border-radius: 2px;
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    font-size: 0.85rem;
    color: #6b5d52;
  }

  .icon-button:hover {
    background: rgba(212, 175, 55, 0.15);
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

  .list-card-header input[type='text'] {
    flex: 1 1 auto;
    border-radius: 2px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    background: rgba(255, 255, 255, 0.6);
    color: #2b2520;
    padding: 0.45rem 0.6rem;
  }

  .list-card textarea {
    border-radius: 2px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    background: rgba(255, 255, 255, 0.5);
    color: #2b2520;
    padding: 0.45rem 0.6rem;
    resize: vertical;
    min-height: 60px;
    font-family: inherit;
  }

  .list-card-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .card-menu {
    position: absolute;
    top: calc(100% - 0.4rem);
    right: 0.85rem;
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.98) 0%, rgba(232, 213, 186, 0.98) 100%);
    border-radius: 4px;
    border: 1px solid rgba(212, 175, 55, 0.4);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    padding: 0.35rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    z-index: 60;
  }

  .card-menu button {
    background: none;
    border: none;
    color: #4a3f35;
    padding: 0.4rem 0.6rem;
    text-align: left;
    border-radius: 2px;
    font-size: 0.78rem;
    cursor: pointer;
  }

  .card-menu button:hover {
    background: rgba(212, 175, 55, 0.2);
  }

  .notice {
    margin: 0;
    font-size: 0.78rem;
    color: #6b5d52;
  }

  .errored {
    color: #a84848;
  }

  .success {
    color: #2d7a4f;
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
