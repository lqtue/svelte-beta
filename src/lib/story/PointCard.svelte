<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { HuntStop } from './types';
  // HuntStop = StoryPoint (backward-compat alias)

  const dispatch = createEventDispatcher<{
    dismiss: void;
  }>();

  export let stop: HuntStop;
  export let isLast = false;
</script>

<div class="stop-card">
  <div class="stop-header">
    <span class="stop-badge">{stop.order + 1}</span>
    <h3 class="stop-title">{stop.title}</h3>
  </div>

  {#if stop.description}
    <p class="stop-description">{stop.description}</p>
  {/if}

  {#if stop.quest}
    <div class="stop-quest">
      <span class="quest-label">Quest</span>
      <p>{stop.quest}</p>
    </div>
  {/if}

  {#if stop.overlayMapId}
    <p class="overlay-note">Historical map overlay is now visible on the map.</p>
  {/if}

  <button type="button" class="continue-btn" on:click={() => dispatch('dismiss')}>
    {isLast ? 'Finish Hunt' : 'Continue'}
  </button>
</div>

<style>
  .stop-card {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.98) 0%, rgba(232, 213, 186, 0.98) 100%);
    border-top: 3px solid #d4af37;
    border-radius: 12px 12px 0 0;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.15);
    z-index: 100;
    max-height: 50vh;
    overflow-y: auto;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .stop-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .stop-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #d4af37;
    color: #fff;
    font-size: 0.9rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .stop-title {
    margin: 0;
    font-family: 'Spectral', serif;
    font-size: 1.15rem;
    font-weight: 700;
    color: #2b2520;
  }

  .stop-description {
    margin: 0;
    font-size: 0.88rem;
    color: #4a3f35;
    line-height: 1.5;
  }

  .stop-quest {
    background: rgba(212, 175, 55, 0.12);
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 4px;
    padding: 0.75rem;
  }

  .quest-label {
    font-size: 0.68rem;
    font-weight: 700;
    color: #8b7355;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stop-quest p {
    margin: 0.25rem 0 0;
    font-size: 0.85rem;
    color: #2b2520;
  }

  .overlay-note {
    margin: 0;
    font-size: 0.78rem;
    color: #2d7a4f;
    font-style: italic;
  }

  .continue-btn {
    margin-top: 0.5rem;
    padding: 0.65rem 1.5rem;
    border: 2px solid #d4af37;
    border-radius: 4px;
    background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
    color: #fff;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    align-self: stretch;
    text-align: center;
  }

  .continue-btn:hover {
    background: linear-gradient(135deg, #e0c050 0%, #d4af37 100%);
    box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);
  }
</style>
