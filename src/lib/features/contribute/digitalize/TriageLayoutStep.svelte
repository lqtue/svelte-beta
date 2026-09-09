<!--
  TriageLayoutStep.svelte — step 1 of /scan?mode=triage: what the sheet is made
  of. A `layout` job proposes one region per part of the sheet; a person
  corrects the categories, the count and (by dragging on the canvas) the boxes.

  Cut verbatim out of TriageSidebar.svelte — props in, events out, no new
  behaviour. `regionsChange` carries the whole list, as it always did.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    LAYOUT_CATEGORIES,
    LAYOUT_COLORS,
    LAYOUT_LABELS,
    type LayoutCategory,
    type LayoutRegion,
  } from '$lib/data/maps/triageTypes';

  export let imgWidth: number = 0;
  export let imgHeight: number = 0;

  /** The layout pass: what the sheet is made of, for a person to correct.
   *  Whether it is *drawn* is the left rail's business, not this panel's. */
  export let layoutRegions: LayoutRegion[] = [];
  export let selectedRegion: number | null = null;
  export let detectingLayout: boolean = false;
  export let layoutError: string = '';
  /** The `layout` pipeline_jobs row, while one is in flight. */
  export let layoutJob: { status: string; error?: string | null } | null = null;

  const dispatch = createEventDispatcher<{
    detectLayout: void;
    regionsChange: LayoutRegion[];
    selectRegion: number | null;
  }>();

  function setCategory(idx: number, category: LayoutCategory) {
    dispatch(
      'regionsChange',
      layoutRegions.map((r, i) => (i === idx ? { ...r, category, source: 'human' as const } : r))
    );
  }

  function removeRegion(idx: number) {
    dispatch(
      'regionsChange',
      layoutRegions.filter((_, i) => i !== idx)
    );
    if (selectedRegion === idx) dispatch('selectRegion', null);
  }

  /** A new region starts as the middle half of the sheet — big enough to grab,
   *  small enough that it is obviously a placeholder to be dragged. */
  function addRegion() {
    const w = Math.round(imgWidth / 2);
    const h = Math.round(imgHeight / 2);
    const next: LayoutRegion[] = [
      ...layoutRegions,
      {
        category: 'legend',
        bbox: [Math.round(w / 2), Math.round(h / 2), w, h],
        confidence: 1,
        source: 'human',
      },
    ];
    dispatch('regionsChange', next);
    dispatch('selectRegion', next.length - 1);
  }
</script>

<div class="sb-section is-strip">
  <div class="sb-row">
    <div class="sb-section-label sb-grow"><span class="sb-step">1</span> Layout</div>
    <button
      class="sb-btn is-ghost is-sm"
      on:click={() => dispatch('detectLayout')}
      disabled={detectingLayout || !imgWidth}
    >
      {detectingLayout ? 'Queued…' : layoutRegions.length ? 'Re-detect' : 'Detect'}
    </button>
  </div>

  <p class="ts-hint">
    What the sheet is made of. A worker asks the model once, at low resolution; the answer lands
    here for you to correct. Dashed edges are its proposal, solid ones yours.
  </p>

  {#if layoutJob && ['queued', 'claimed', 'running'].includes(layoutJob.status)}
    <p class="sb-note">
      Layout job {layoutJob.status} — nothing happens until a worker claims it.
    </p>
  {:else if layoutJob?.status === 'failed'}
    <p class="empty-state error is-plate">
      Layout job failed: {layoutJob.error ?? 'no reason recorded'}
    </p>
  {/if}
  {#if layoutError}<p class="empty-state error is-plate">{layoutError}</p>{/if}

  {#if layoutRegions.length}
    <ul class="ts-regions">
      {#each layoutRegions as r, i (i)}
        <li class:selected={selectedRegion === i}>
          <button
            class="ts-region-row"
            on:click={() => dispatch('selectRegion', selectedRegion === i ? null : i)}
          >
            <span class="ts-swatch" style="background: {LAYOUT_COLORS[r.category]}"></span>
            <select
              value={r.category}
              on:click|stopPropagation
              on:change={(e) => setCategory(i, e.currentTarget.value as LayoutCategory)}
              class="ts-region-cat"
            >
              {#each LAYOUT_CATEGORIES as c (c)}
                <option value={c}>{LAYOUT_LABELS[c]}</option>
              {/each}
            </select>
            <span class="ts-region-size">{r.bbox[2]}×{r.bbox[3]}</span>
            {#if r.source === 'model'}
              <span class="ts-region-conf" title="model confidence"
                >{Math.round(r.confidence * 100)}%</span
              >
            {/if}
          </button>
          <button class="ts-region-del" title="Remove this region" on:click={() => removeRegion(i)}
            >×</button
          >
        </li>
      {/each}
    </ul>

    <div class="ts-region-actions">
      <button class="sb-btn is-ghost is-sm" on:click={addRegion} disabled={!imgWidth}
        >Add region</button
      >
    </div>
  {:else if !detectingLayout}
    <div class="ts-region-actions">
      <button class="sb-btn is-ghost is-sm" on:click={addRegion} disabled={!imgWidth}
        >Add one by hand</button
      >
    </div>
  {/if}
</div>

<style>
  /* The furniture every step wears — `.sb-step`, `.sb-note`, `.sb-more`,
     `.sb-mono`, `.sb-coord-grid`/`.sb-coord-label` and the boxed error face
     `.empty-state.error.is-plate` — is in $styles/components/sidebar.css.
     Only what this step alone draws is declared here. */
  .ts-hint {
    margin: 0 0 0.5rem;
    font-size: 0.72rem;
    line-height: 1.45;
    opacity: 0.65;
  }

  .ts-regions {
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ts-regions li {
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
  }
  .ts-regions li.selected {
    background: var(--color-gray-100);
  }
  .ts-region-row {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    padding: 0.25rem 0.3rem;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  /* 14px, not the 9px the region rule asked for: `.ts-swatch` was declared
     twice in TriageSidebar and the later tile-legend rule won, so this is the
     size it has always rendered at. */
  .ts-swatch {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 2px;
    border: 1.5px solid;
  }
  .ts-region-cat {
    flex: 1;
    min-width: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.74rem;
    cursor: pointer;
  }
  .ts-region-cat:hover {
    border-color: var(--color-border);
  }
  .ts-region-size,
  .ts-region-conf {
    flex: none;
    font-size: 0.66rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.55;
  }
  .ts-region-del {
    flex: none;
    width: 1.4rem;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font-size: 1rem;
    line-height: 1;
    opacity: 0.4;
    cursor: pointer;
  }
  .ts-region-del:hover {
    opacity: 1;
    color: var(--color-error-600);
  }
  .ts-region-actions {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }
</style>
