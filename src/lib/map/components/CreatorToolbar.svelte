<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { DrawingMode } from '$lib/viewer/types';

  export let drawingMode: DrawingMode | null = null;
  export let drawMenuOpen = false;
  export let editingEnabled = true;
  export let canUndo = false;
  export let canRedo = false;
  export let toolbarSettingsOpen = false;
  export let visibleStoryScenes: unknown[] = [];

  const dispatch = createEventDispatcher<{
    searchclick: void;
    deactivatedrawing: void;
    setdrawingmode: DrawingMode;
    toggleediting: void;
    undolastaction: void;
    redolastaction: void;
    opencapturemodal: void;
    startstorypresentation: void;
    toggleappmode: void;
    handleclearstate: void;
  }>();

  function setDrawingMode(mode: DrawingMode) {
    dispatch('setdrawingmode', mode);
  }
</script>

<div class="creator-toolbar">
  <div class="toolbar-cluster">
    <button
      type="button"
      on:click={() => dispatch('searchclick')}
      title="Search places"
      aria-label="Search places"
    >
      <span class="toolbar-icon">🔍</span>
    </button>
  </div>
  <div class="toolbar-cluster">
    <button
      type="button"
      class:selected={!drawingMode}
      on:click={() => dispatch('deactivatedrawing')}
      title="Pan the map"
      aria-label="Pan the map"
    >
      <span class="toolbar-icon">🖐</span>
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
        <span class="toolbar-icon">✏️</span>
      </button>
      {#if drawMenuOpen}
        <div class="toolbar-menu">
          <button type="button" class:selected={drawingMode === 'point'} on:click={() => { setDrawingMode('point'); drawMenuOpen = false; }}>
            Point
          </button>
          <button type="button" class:selected={drawingMode === 'line'} on:click={() => { setDrawingMode('line'); drawMenuOpen = false; }}>
            Line
          </button>
          <button type="button" class:selected={drawingMode === 'polygon'} on:click={() => { setDrawingMode('polygon'); drawMenuOpen = false; }}>
            Polygon
          </button>
          <button type="button" class:selected={editingEnabled} on:click={() => { dispatch('toggleediting'); drawMenuOpen = false; }}>
            {editingEnabled ? 'Disable edit' : 'Enable edit'}
          </button>
          <button type="button" on:click={() => { dispatch('deactivatedrawing'); drawMenuOpen = false; }}>
            Finish drawing
          </button>
        </div>
      {/if}
    </div>
    <button
      type="button"
      title="Undo"
      aria-label="Undo"
      on:click={() => dispatch('undolastaction')}
      disabled={!canUndo}
    >
      <span class="toolbar-icon">↺</span>
    </button>
    <button
      type="button"
      title="Redo"
      aria-label="Redo"
      on:click={() => dispatch('redolastaction')}
      disabled={!canRedo}
    >
      <span class="toolbar-icon">↻</span>
    </button>
  </div>
  <div class="toolbar-cluster">
    <button
      type="button"
      on:click={() => dispatch('opencapturemodal')}
      title="Capture current view"
      aria-label="Capture scene"
    >
      <span class="toolbar-icon">📷</span>
    </button>
    <button
      type="button"
      on:click={() => dispatch('startstorypresentation')}
      title="Present story"
      aria-label="Present story"
      disabled={!visibleStoryScenes.length}
    >
      <span class="toolbar-icon">🎞</span>
    </button>
  </div>
  <div class="toolbar-cluster">
    <div class="toolbar-group">
      <button
        type="button"
        class:selected={toolbarSettingsOpen}
        on:click={() => (toolbarSettingsOpen = !toolbarSettingsOpen)}
        title="Settings"
        aria-label="Settings"
        aria-haspopup="true"
        aria-expanded={toolbarSettingsOpen}
      >
        <span class="toolbar-icon">⚙️</span>
      </button>
      {#if toolbarSettingsOpen}
        <div class="toolbar-menu">
          <button type="button" on:click={() => { dispatch('toggleappmode'); toolbarSettingsOpen = false; }}>
            Switch to Viewer
          </button>
          <button type="button" on:click={() => { dispatch('handleclearstate'); toolbarSettingsOpen = false; }}>
            Clear cached state
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .creator-toolbar {
    position: fixed;
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom) + 1.2rem);
    transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.88);
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    padding: 0.45rem 0.75rem;
    display: flex;
    gap: 0.6rem;
    align-items: center;
    box-shadow: 0 16px 32px rgba(2, 6, 23, 0.55);
    backdrop-filter: blur(16px);
    z-index: 120;
    pointer-events: auto;
  }

  .toolbar-cluster {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .creator-toolbar button {
    border: none;
    background: none;
    color: inherit;
    border-radius: 0.75rem;
    padding: 0.45rem 0.6rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .creator-toolbar button:hover,
  .creator-toolbar button:focus-visible,
  .creator-toolbar button.selected {
    background: rgba(79, 70, 229, 0.55);
    outline: none;
  }

  .creator-toolbar button:disabled {
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
    background: rgba(15, 23, 42, 0.95);
    border-radius: 0.8rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    box-shadow: 0 16px 32px rgba(2, 6, 23, 0.45);
    display: flex;
    flex-direction: column;
    min-width: 160px;
    padding: 0.45rem;
    z-index: 95;
  }

  .toolbar-menu button {
    width: 100%;
    background: none;
    padding: 0.45rem 0.6rem;
    border-radius: 0.65rem;
    font-size: 0.78rem;
    text-align: left;
  }

  .toolbar-menu button:hover,
  .toolbar-menu button:focus-visible {
    background: rgba(79, 70, 229, 0.35);
    outline: none;
  }

  .toolbar-icon {
    font-size: 1.05rem;
    line-height: 1;
  }
</style>
