<!--
  CreateToolbar.svelte — Bottom floating toolbar for /create mode.
  Place point, undo/redo, save, preview.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    togglePlacing: void;
    undo: void;
    redo: void;
    save: void;
    preview: void;
    openSearch: void;
  }>();

  export let placingPoint = false;
  export let canUndo = false;
  export let canRedo = false;
  export let pointCount = 0;
</script>

<div class="toolbar">
  <div class="toolbar-inner">
    <div class="toolbar-group">
      <button
        type="button"
        class="tool-btn"
        class:active={placingPoint}
        on:click={() => dispatch('togglePlacing')}
        title="Place a story point on the map"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
        <span class="tool-label">{placingPoint ? 'Placing...' : 'Place point'}</span>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button
        type="button"
        class="tool-btn"
        disabled={!canUndo}
        on:click={() => dispatch('undo')}
        title="Undo (Ctrl+Z)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 10h10a5 5 0 015 5v2" /><polyline points="3 10 7 6" /><polyline points="3 10 7 14" />
        </svg>
      </button>
      <button
        type="button"
        class="tool-btn"
        disabled={!canRedo}
        on:click={() => dispatch('redo')}
        title="Redo (Ctrl+Shift+Z)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10H11a5 5 0 00-5 5v2" /><polyline points="21 10 17 6" /><polyline points="21 10 17 14" />
        </svg>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button
        type="button"
        class="tool-btn"
        on:click={() => dispatch('openSearch')}
        title="Search location"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
        </svg>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button
        type="button"
        class="tool-btn save"
        on:click={() => dispatch('save')}
        title="Save story"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
        </svg>
        <span class="tool-label">Save</span>
      </button>
      <button
        type="button"
        class="tool-btn"
        on:click={() => dispatch('preview')}
        disabled={pointCount < 1}
        title="Preview story"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        <span class="tool-label">Preview</span>
      </button>
    </div>
  </div>
</div>

<style>
  .toolbar {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    pointer-events: auto;
  }

  .toolbar-inner {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.55rem 0.85rem;
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.97) 0%, rgba(232, 213, 186, 0.97) 100%);
    border: 2px solid #d4af37;
    border-radius: 6px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(16px);
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .toolbar-divider {
    width: 1px;
    height: 22px;
    background: rgba(212, 175, 55, 0.3);
    margin: 0 0.2rem;
  }

  .tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.55rem;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    color: #4a3f35;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    font-size: 0.75rem;
  }

  .tool-btn:hover:not(:disabled) {
    background: rgba(212, 175, 55, 0.15);
    border-color: rgba(212, 175, 55, 0.4);
  }

  .tool-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .tool-btn.active {
    background: rgba(212, 175, 55, 0.25);
    border-color: #d4af37;
    color: #2b2520;
    font-weight: 600;
  }

  .tool-btn.save {
    color: #2b2520;
    font-weight: 600;
  }

  .tool-label {
    font-family: 'Be Vietnam Pro', sans-serif;
    font-weight: 500;
  }
</style>
