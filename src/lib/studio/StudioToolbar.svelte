<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { DrawingMode } from '$lib/viewer/types';

  const dispatch = createEventDispatcher<{
    setDrawingMode: { mode: DrawingMode | null };
    undo: void;
    redo: void;
    openSearch: void;
    openMetadata: void;
    clearState: void;
  }>();

  export let drawingMode: DrawingMode | null = null;
  export let canUndo = false;
  export let canRedo = false;

  let drawMenuOpen = false;
  let settingsOpen = false;

  function pickDrawMode(mode: DrawingMode) {
    dispatch('setDrawingMode', { mode: drawingMode === mode ? null : mode });
    drawMenuOpen = false;
  }
</script>

<div class="toolbar">
  <div class="toolbar-cluster">
    <button
      type="button"
      on:click={() => dispatch('openSearch')}
      title="Search places"
      aria-label="Search places"
    >
      <span class="toolbar-icon">&#x1F50D;</span>
    </button>
  </div>
  <div class="toolbar-cluster">
    <button
      type="button"
      class:selected={!drawingMode}
      on:click={() => dispatch('setDrawingMode', { mode: null })}
      title="Pan the map"
      aria-label="Pan the map"
    >
      <span class="toolbar-icon">&#x1F590;</span>
    </button>
    <div class="toolbar-group">
      <button
        type="button"
        class:selected={drawMenuOpen || !!drawingMode}
        on:click={() => (drawMenuOpen = !drawMenuOpen)}
        title="Draw annotations"
        aria-label="Draw annotations"
        aria-haspopup="true"
        aria-expanded={drawMenuOpen}
      >
        <span class="toolbar-icon">&#x270F;&#xFE0F;</span>
      </button>
      {#if drawMenuOpen}
        <div class="toolbar-menu">
          <button type="button" class:selected={drawingMode === 'point'} on:click={() => pickDrawMode('point')}>
            Point
          </button>
          <button type="button" class:selected={drawingMode === 'line'} on:click={() => pickDrawMode('line')}>
            Line
          </button>
          <button type="button" class:selected={drawingMode === 'polygon'} on:click={() => pickDrawMode('polygon')}>
            Polygon
          </button>
          <button type="button" on:click={() => { dispatch('setDrawingMode', { mode: null }); drawMenuOpen = false; }}>
            Finish drawing
          </button>
        </div>
      {/if}
    </div>
    <button
      type="button"
      title="Undo"
      aria-label="Undo"
      on:click={() => dispatch('undo')}
      disabled={!canUndo}
    >
      <span class="toolbar-icon">&#x21BA;</span>
    </button>
    <button
      type="button"
      title="Redo"
      aria-label="Redo"
      on:click={() => dispatch('redo')}
      disabled={!canRedo}
    >
      <span class="toolbar-icon">&#x21BB;</span>
    </button>
  </div>
  <div class="toolbar-cluster">
    <button
      type="button"
      on:click={() => dispatch('openMetadata')}
      title="Map info"
      aria-label="Map info"
    >
      <span class="toolbar-icon">&#x2139;&#xFE0F;</span>
    </button>
    <div class="toolbar-group">
      <button
        type="button"
        class:selected={settingsOpen}
        on:click={() => (settingsOpen = !settingsOpen)}
        title="Settings"
        aria-label="Settings"
        aria-haspopup="true"
        aria-expanded={settingsOpen}
      >
        <span class="toolbar-icon">&#x2699;&#xFE0F;</span>
      </button>
      {#if settingsOpen}
        <div class="toolbar-menu">
          <button type="button" on:click={() => { dispatch('clearState'); settingsOpen = false; }}>
            Clear cached state
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .toolbar {
    position: fixed;
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom) + 1.2rem);
    transform: translateX(-50%);
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.96) 0%, rgba(232, 213, 186, 0.96) 100%);
    border-radius: 999px;
    border: 2px solid #d4af37;
    padding: 0.45rem 0.75rem;
    display: flex;
    gap: 0.6rem;
    align-items: center;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(12px);
    z-index: 120;
    pointer-events: auto;
    color: #2b2520;
  }

  .toolbar-cluster {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .toolbar button {
    border: 1px solid transparent;
    background: none;
    color: #4a3f35;
    border-radius: 2px;
    padding: 0.45rem 0.6rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toolbar button:hover,
  .toolbar button:focus-visible {
    background: rgba(212, 175, 55, 0.2);
    border-color: rgba(212, 175, 55, 0.5);
    outline: none;
  }

  .toolbar button.selected {
    background: rgba(212, 175, 55, 0.3);
    border-color: #d4af37;
    color: #2b2520;
  }

  .toolbar button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .toolbar-group {
    position: relative;
  }

  .toolbar-menu {
    position: absolute;
    bottom: calc(100% + 0.4rem);
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.98) 0%, rgba(232, 213, 186, 0.98) 100%);
    border-radius: 4px;
    border: 1px solid rgba(212, 175, 55, 0.4);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    min-width: 160px;
    padding: 0.35rem;
    z-index: 95;
  }

  .toolbar-menu button {
    width: 100%;
    background: none;
    border: none;
    color: #4a3f35;
    padding: 0.45rem 0.6rem;
    border-radius: 2px;
    font-size: 0.78rem;
    text-align: left;
    cursor: pointer;
  }

  .toolbar-menu button:hover,
  .toolbar-menu button:focus-visible {
    background: rgba(212, 175, 55, 0.2);
    outline: none;
  }

  .toolbar-menu button.selected {
    background: rgba(212, 175, 55, 0.35);
    color: #2b2520;
    font-weight: 600;
  }

  .toolbar-icon {
    font-size: 1.05rem;
    line-height: 1;
  }
</style>
