<!--
  TripIntro.svelte — Bottom-sheet welcome over the map.
  The map renders behind; this sheet introduces the walk and offers Start.
-->
<script lang="ts">
  import { t } from '$lib/core/i18n';
  import { createEventDispatcher } from 'svelte';
  import type { Story } from '$lib/features/stories/shared/types';

  export let story: Story;
  export let estimatedMinutes: number = 0;
  export let hasProgress = false;

  const dispatch = createEventDispatcher<{ start: void; resume: void }>();

  $: stops = story.points.length;
</script>

<div class="intro-scrim" role="dialog" aria-modal="true" aria-labelledby="trip-intro-title">
  <div class="intro-sheet">
    <div class="drag-grip" aria-hidden="true"></div>
    <div class="intro-eyebrow">{$t('Walking trip')}</div>
    <h1 id="trip-intro-title">{story.title}</h1>

    <div class="meta-row">
      <span class="badge-chip is-sm"><strong>{stops}</strong> {$t('stops')}</span>
      {#if estimatedMinutes > 0}
        <span class="badge-chip is-sm">~{estimatedMinutes} {$t('min')}</span>
      {/if}
      <span class="badge-chip is-sm chip-yellow">{$t('On foot')}</span>
    </div>

    {#if story.description}
      <p class="desc">{story.description}</p>
    {/if}

    <ul class="tips">
      <li>{$t('Allow location so we can guide you between stops.')}</li>
      <li>{$t('Some stops have small questions — look around to find them.')}</li>
      <li>{$t('Old maps fade in as you walk through them.')}</li>
    </ul>

    <div class="cta-row">
      {#if hasProgress}
        <button type="button" class="btn is-primary" on:click={() => dispatch('resume')}>
          Resume trip →
        </button>
        <button type="button" class="btn" on:click={() => dispatch('start')}> Restart </button>
      {:else}
        <button type="button" class="btn is-primary" on:click={() => dispatch('start')}>
          Start walking →
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .intro-scrim {
    position: absolute;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-text) 0%, transparent) 0%,
      color-mix(in srgb, var(--color-text) 18%, transparent) 60%,
      color-mix(in srgb, var(--color-text) 32%, transparent) 100%
    );
    pointer-events: auto;
  }
  .intro-sheet {
    width: 100%;
    max-width: 560px;
    background: var(--sb-card-bg);
    border-top: var(--border-thin);
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -6px 0 color-mix(in srgb, var(--color-text) 9%, transparent);
    padding: 0.5rem 1.1rem calc(env(safe-area-inset-bottom) + 1.25rem);
    color: var(--sb-text);
    font-family: var(--sb-font-base);
    max-height: 85vh;
    overflow-y: auto;
  }
  .drag-grip {
    width: 38px;
    height: 4px;
    margin: 0.4rem auto 0.6rem;
    background: color-mix(in srgb, var(--color-text) 20%, transparent);
    border-radius: 99px;
  }
  .intro-eyebrow {
    font-family: var(--sb-font-display);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--sb-accent);
  }
  h1 {
    margin: 0.25rem 0 0.7rem;
    font-family: var(--sb-font-display);
    font-size: 1.65rem;
    line-height: 1.15;
    font-weight: 800;
  }
  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 0.85rem;
  }
  .desc {
    margin: 0 0 0.85rem;
    font-size: 0.95rem;
    line-height: 1.5;
    color: var(--color-text);
  }
  .tips {
    margin: 0 0 1rem;
    padding-left: 1.1rem;
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--sb-text-meta);
  }
  .tips li {
    margin-bottom: 0.25rem;
  }
  .cta-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  /* Layout only — full-width thumb targets stacked in the sheet. */
  .cta-row .btn {
    width: 100%;
    --btn-pad: 0.95rem 1rem;
    --btn-text: 1rem;
  }
</style>
