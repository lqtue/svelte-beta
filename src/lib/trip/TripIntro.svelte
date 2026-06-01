<!--
  TripIntro.svelte — Bottom-sheet welcome over the map.
  The map renders behind; this sheet introduces the walk and offers Start.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Story } from '$lib/story/types';

  export let story: Story;
  export let estimatedMinutes: number = 0;
  export let hasProgress = false;

  const dispatch = createEventDispatcher<{ start: void; resume: void }>();

  $: stops = story.points.length;
</script>

<div class="intro-scrim" role="dialog" aria-modal="true" aria-labelledby="trip-intro-title">
  <div class="intro-sheet">
    <div class="drag-grip" aria-hidden="true"></div>
    <div class="intro-eyebrow">Walking trip</div>
    <h1 id="trip-intro-title">{story.title}</h1>

    <div class="meta-row">
      <span class="chip"><strong>{stops}</strong> stops</span>
      {#if estimatedMinutes > 0}
        <span class="chip">~{estimatedMinutes} min</span>
      {/if}
      <span class="chip chip-walk">On foot</span>
    </div>

    {#if story.description}
      <p class="desc">{story.description}</p>
    {/if}

    <ul class="tips">
      <li>Allow location so we can guide you between stops.</li>
      <li>Some stops have small questions — look around to find them.</li>
      <li>Old maps fade in as you walk through them.</li>
    </ul>

    <div class="cta-row">
      {#if hasProgress}
        <button type="button" class="cta is-primary" on:click={() => dispatch('resume')}>
          Resume trip →
        </button>
        <button type="button" class="cta is-ghost" on:click={() => dispatch('start')}>
          Restart
        </button>
      {:else}
        <button type="button" class="cta is-primary" on:click={() => dispatch('start')}>
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
    background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 60%, rgba(0,0,0,0.32) 100%);
    pointer-events: auto;
  }
  .intro-sheet {
    width: 100%;
    max-width: 560px;
    background: var(--sb-card-bg, #fdfaf3);
    border-top: 2px solid #111;
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -6px 0 #11111118;
    padding: 0.5rem 1.1rem calc(env(safe-area-inset-bottom) + 1.25rem);
    color: var(--sb-text, #111);
    font-family: var(--sb-font-base, 'Be Vietnam Pro', system-ui, sans-serif);
    max-height: 85vh;
    overflow-y: auto;
  }
  .drag-grip {
    width: 38px; height: 4px;
    margin: 0.4rem auto 0.6rem;
    background: #11111133;
    border-radius: 99px;
  }
  .intro-eyebrow {
    font-family: var(--sb-font-display, 'Spectral', serif);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--sb-accent, #ea580c);
  }
  h1 {
    margin: 0.25rem 0 0.7rem;
    font-family: var(--sb-font-display, 'Spectral', serif);
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
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3rem 0.65rem;
    background: #fff;
    border: 1.5px solid #111;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 600;
  }
  .chip strong { font-weight: 800; }
  .chip-walk { background: #fde68a; }
  .desc {
    margin: 0 0 0.85rem;
    font-size: 0.95rem;
    line-height: 1.5;
    color: #1a1a1a;
  }
  .tips {
    margin: 0 0 1rem;
    padding-left: 1.1rem;
    font-size: 0.85rem;
    line-height: 1.5;
    color: #444;
  }
  .tips li { margin-bottom: 0.25rem; }
  .cta-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .cta {
    width: 100%;
    padding: 0.95rem 1rem;
    border-radius: 14px;
    border: 2px solid #111;
    font-size: 1rem;
    font-weight: 800;
    font-family: inherit;
    cursor: pointer;
    box-shadow: 3px 3px 0 #111;
    transition: transform 0.06s ease, box-shadow 0.06s ease;
  }
  .cta:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #111; }
  .cta.is-primary { background: var(--sb-accent, #ea580c); color: #fff; }
  .cta.is-ghost   { background: #fff; color: #111; box-shadow: 2px 2px 0 #111; }
</style>
