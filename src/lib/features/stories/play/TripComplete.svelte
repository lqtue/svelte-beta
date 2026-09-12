<!--
  TripComplete.svelte — Celebration body shown at end of the trip.
-->
<script lang="ts">
  import { t } from '$lib/core/i18n';
  import { createEventDispatcher } from 'svelte';
  import type { Story } from '$lib/features/stories/shared/types';

  export let story: Story;
  export let stopsVisited: number;
  export let walkedMeters: number;
  export let elapsedMinutes: number;
  export let canSaveProgress = false;

  const dispatch = createEventDispatcher<{
    done: void;
    share: void;
    save: void;
  }>();

  $: km = walkedMeters / 1000;
  $: distanceLabel = km >= 1 ? `${km.toFixed(2)} km` : `${Math.round(walkedMeters)} m`;

  async function handleShare() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const text = `I just walked "${story.title}" on Vietnam Map Archive.`;
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: story.title, text, url });
        dispatch('share');
        return;
      } catch {
        // user cancelled — fall through
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* ignore */
      }
    }
    dispatch('share');
  }
</script>

<div class="complete" data-testid="trip-complete">
  <h2>{$t('You made it.')}</h2>
  <p class="subtitle">{story.title}</p>

  <div class="stats">
    <div class="stat-tile is-sm">
      <span class="value">{stopsVisited}</span>
      <span class="label">{$t('stops')}</span>
    </div>
    <div class="stat-tile is-sm">
      <span class="value">{distanceLabel}</span>
      <span class="label">{$t('walked')}</span>
    </div>
    <div class="stat-tile is-sm">
      <span class="value">{elapsedMinutes}</span>
      <span class="label">{$t('minutes')}</span>
    </div>
  </div>

  {#if canSaveProgress}
    <button type="button" class="save-row" on:click={() => dispatch('save')}>
      <span>
        <strong>{$t('Save your trip')}</strong><br />
        <small>{$t('Log in to keep this on your profile.')}</small>
      </span>
    </button>
  {/if}

  <div class="actions">
    <button type="button" class="btn is-primary" on:click={handleShare}>{$t('Share')}</button>
    <button type="button" class="btn" on:click={() => dispatch('done')}>Done</button>
  </div>
</div>

<style>
  .complete {
    padding: 0.4rem 0.2rem 0.6rem;
    color: var(--sb-text);
  }
  h2 {
    margin: 0.4rem 0 0.15rem;
    font-family: var(--sb-font-display);
    font-size: 1.45rem;
    font-weight: 800;
  }
  .subtitle {
    margin: 0 0 1rem;
    color: var(--sb-text-meta);
    font-size: 0.92rem;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin-bottom: 0.9rem;
  }

  .save-row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    text-align: left;
    padding: 0.7rem 0.85rem;
    margin-bottom: 0.85rem;
    background: color-mix(in srgb, var(--color-yellow) 35%, var(--color-white));
    border: var(--border-thin);
    border-radius: 12px;
    box-shadow: var(--shadow-solid-xs);
    cursor: pointer;
    font-family: inherit;
    color: var(--color-text);
  }
  .save-row small {
    color: var(--sb-text-meta);
    font-size: 0.78rem;
  }
  .save-row:active {
    transform: translate(2px, 2px);
    box-shadow: 0 0 0 var(--color-border);
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }
  /* Layout only — a thumb-sized pair filling the sheet's width. */
  .actions .btn {
    flex: 1;
    --btn-pad: 0.85rem 0.8rem;
    --btn-text: 0.95rem;
  }
</style>
