<!--
  TopSheetActions.svelte — the way out of the viewer for the sheet on top of
  the stack: its traced fabric, its scan, its annotation page, its share link.

  /explore had zero outbound links until Sept 2026. The strip lived at the foot
  of the layer stack in the left rail, then briefly above the right rail's tab
  strip — where it pushed the tabs down and belonged to no tab. It sits inside
  the right rail's Info tab now, under the sheet's name, which is also why it
  prints no name of its own.
-->
<script lang="ts">
  import { t } from '$lib/core/i18n';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ toggleVectors: { mapId: string } }>();

  export let mapId: string | null = null;
  /** A draft has no share page — /catalog/[id] 404s on anything unpublished. */
  export let published = false;
  export let vectorsOn = false;
</script>

{#if mapId}
  <div class="tsa">
    <button
      type="button"
      class="sb-btn is-sm"
      class:is-on={vectorsOn}
      on:click={() => dispatch('toggleVectors', { mapId })}
      aria-pressed={vectorsOn}
      title="Traced footprints">⬡ Traced</button
    >
    <a class="sb-btn is-sm" href="/scan?map={mapId}">{$t('Scan')}</a>
    <a class="sb-btn is-sm" href="/explore?mode=studio&map={mapId}">Studio</a>
    {#if published}
      <a class="sb-btn is-sm" href="/catalog/{mapId}">{$t('Share')}</a>
    {/if}
  </div>
{/if}

<style>
  /* Inside a card body, which owns the padding. */
  .tsa {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0 0 0.6rem;
  }
</style>
