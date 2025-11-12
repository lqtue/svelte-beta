<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let appMode: 'explore' | 'create' = 'explore';

  const dispatch = createEventDispatcher<{
    choosemode: 'explore' | 'create';
  }>();

  function chooseMode(mode: 'explore' | 'create') {
    dispatch('choosemode', mode);
  }
</script>

<div class="welcome-overlay">
  <div class="welcome-card">
    <h1>Welcome to the VMA studio</h1>
    <p>
      Choose how you want to start. Viewer lets you explore; Creator unlocks annotation and storytelling tools.
    </p>
    <div class="welcome-actions">
      <button
        type="button"
        class="chip ghost"
        class:active={appMode === 'explore'}
        on:click={() => chooseMode('explore')}
      >
        Viewer
      </button>
      <button
        type="button"
        class="chip"
        class:active={appMode === 'create'}
        on:click={() => chooseMode('create')}
      >
        Creator
      </button>
    </div>
  </div>
</div>

<style>
  .welcome-overlay {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: rgba(15, 23, 42, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 140;
    backdrop-filter: blur(14px);
  }

  .welcome-card {
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(129, 140, 248, 0.25);
    border-radius: 1.2rem;
    padding: 2.2rem 2.6rem;
    max-width: 520px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    box-shadow: 0 32px 64px rgba(30, 41, 59, 0.45);
  }

  .welcome-card h1 {
    margin: 0;
    font-size: 2rem;
  }

  .welcome-card p {
    margin: 0;
    color: rgba(191, 219, 254, 0.85);
  }

  .welcome-actions {
    display: inline-flex;
    gap: 0.75rem;
    justify-content: center;
  }

  .welcome-actions .chip {
    min-width: 120px;
    font-size: 1rem;
    padding: 0.75rem 1.5rem;
  }

  .welcome-actions .chip.active {
    box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.4);
  }
</style>
