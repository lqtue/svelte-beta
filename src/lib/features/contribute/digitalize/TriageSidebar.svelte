<!--
  TriageSidebar.svelte — Left panel for the Triage phase of /scan?mode=triage.

  The verdict plate (accept / update the saved triage) plus the four steps,
  each its own component: Layout · Crop · Tiles · Run OCR. This file keeps only
  what more than one of them needs — `triageDirty` and `neatlineValid`, which
  the verdict button and the run button both read, so they are computed once
  here and passed down rather than recomputed in a child.

  All triage params are bound two-way from the parent page.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import '$styles/layouts/tool-page.css';
  import type { TileOverrides } from './tileParams';
  import {
    TRIAGE_STATE_LABELS,
    triageState,
    type LayoutRegion,
    type SavedTriage,
  } from '$lib/data/maps/triageTypes';
  import TriageLayoutStep from './TriageLayoutStep.svelte';
  import TriageCropStep from './TriageCropStep.svelte';
  import TriageTilesStep from './TriageTilesStep.svelte';
  import TriageRunStep from './TriageRunStep.svelte';

  export let imgWidth: number = 0;
  export let imgHeight: number = 0;

  // Two-way bound from parent
  export let neatline: [number, number, number, number] | null = null;
  export let runId: string = '';
  export let minConfidence: number = 0.5;

  // Two-way bound (direct user inputs)
  export let tileSize: number = 2400;
  export let overlap: number = 300;

  // Read-only from parent
  export let tileOverrides: TileOverrides = {};

  export let ocrRunning: boolean = false;
  export let ocrError: string = '';
  /** Set once the run is queued; a worker has to claim it before anything happens. */
  export let queuedJobId: string | null = null;
  export let runs: Record<string, { n: number; categories: Record<string, number> }> = {};

  /** What `maps.triage` holds for this map — null until someone saves one. */
  export let savedTriage: SavedTriage | null = null;
  export let savingTriage: boolean = false;
  export let saveTriageError: string = '';
  export let suggesting: boolean = false;
  export let suggestError: string = '';

  /** The layout pass: what the sheet is made of, for a person to correct.
   *  Whether it is *drawn* is the left rail's business, not this panel's. */
  export let layoutRegions: LayoutRegion[] = [];
  export let selectedRegion: number | null = null;
  export let detectingLayout: boolean = false;
  export let layoutError: string = '';
  /** The `layout` pipeline_jobs row, while one is in flight. */
  export let layoutJob: { status: string; error?: string | null } | null = null;

  const dispatch = createEventDispatcher<{
    saveTriage: void;
  }>();

  $: mainMap = layoutRegions.find((r) => r.category === 'main_map') ?? null;

  // Proposed vs accepted. The layout pass can now produce a whole triage with
  // nobody looking, so "has a triage" no longer means "someone decided this" —
  // the panel has to say which of the two this sheet is.
  $: savedState = triageState(savedTriage);
  $: acceptedOn = savedTriage?.validated_at
    ? new Date(savedTriage.validated_at).toLocaleDateString()
    : '';

  $: neatlineValid =
    !neatline ||
    (neatline[0] >= 0 &&
      neatline[1] >= 0 &&
      neatline[0] + neatline[2] <= imgWidth &&
      neatline[1] + neatline[3] <= imgHeight &&
      neatline[2] > 0 &&
      neatline[3] > 0);

  // Compared field by field rather than by JSON.stringify: tileOverrides key order
  // is insertion order, so two identical grids built by different click paths
  // stringify differently and would read as unsaved for ever.
  $: triageDirty =
    !savedTriage ||
    String(savedTriage.neatline) !== String(neatline) ||
    savedTriage.tile_size !== tileSize ||
    savedTriage.overlap !== overlap ||
    Object.keys(savedTriage.tile_overrides ?? {}).length !== Object.keys(tileOverrides).length ||
    Object.entries(tileOverrides).some(([k, v]) => savedTriage?.tile_overrides?.[k] !== v);
</script>

<div class="triage-sidebar">
  <!-- Where this sheet stands, and the one button that moves it. It used to be
       step 4, four scrolls down, which is a strange place for the only decision
       on the page: everything above it is a proposal you are agreeing to. -->
  <div class="sb-section is-strip ts-verdict" class:is-ready={savedState === 'ready'}>
    <div class="ts-verdict-line">
      {#if savedState === 'ready'}
        Accepted{acceptedOn ? ` ${acceptedOn}` : ''} — the batch script will take this sheet.
      {:else if savedState === 'proposed'}
        {savedTriage
          ? 'Proposed by the layout pass. Nothing is queued until you accept it.'
          : 'Not saved. This triage lives only in this browser.'}
      {:else}
        {TRIAGE_STATE_LABELS[savedState]}
      {/if}
    </div>
    {#if saveTriageError}
      <div class="empty-state error is-plate">{saveTriageError}</div>
    {/if}
    <button
      class="sb-btn is-block"
      class:is-primary={triageDirty}
      class:is-ghost={!triageDirty}
      on:click={() => dispatch('saveTriage')}
      disabled={savingTriage || !neatlineValid || !neatline}
    >
      {#if savingTriage}
        Saving…
      {:else if savedState === 'proposed'}
        Accept triage
      {:else if savedTriage}
        Update saved triage
      {:else}
        Save triage
      {/if}
    </button>
  </div>

  <TriageLayoutStep
    {imgWidth}
    {imgHeight}
    {layoutRegions}
    {selectedRegion}
    {detectingLayout}
    {layoutError}
    {layoutJob}
    on:detectLayout
    on:regionsChange
    on:selectRegion
  />

  <TriageCropStep
    {imgWidth}
    {imgHeight}
    bind:neatline
    {neatlineValid}
    {mainMap}
    neatlineSrc={savedTriage?.neatline_src}
    {suggesting}
    {suggestError}
    on:suggestTriage
  />

  <TriageTilesStep {neatline} bind:tileSize bind:overlap {tileOverrides} />

  <TriageRunStep
    {imgWidth}
    bind:runId
    bind:minConfidence
    {ocrRunning}
    {ocrError}
    {queuedJobId}
    {runs}
    {triageDirty}
    {neatlineValid}
    on:runOcr
    on:loadRun
  />
</div>

<style>
  /* Section / field / button primitives live in $styles/components/sidebar.css
     (`.sb-*`); the padded, divided band each step wears is `.sb-section.is-strip`
     there, and the boxed error face is `.empty-state.error.is-plate`. Only the
     verdict is declared here. */
  .triage-sidebar {
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  /* The verdict sits above the steps and outweighs them: it is the only thing
     on this panel that changes what happens to the sheet. */
  .ts-verdict {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--sb-surface, var(--color-white));
    border-bottom: var(--sb-border);
  }
  .ts-verdict.is-ready .ts-verdict-line {
    opacity: 0.6;
  }
  .ts-verdict-line {
    font-size: 0.78rem;
    line-height: 1.35;
    margin-bottom: 0.5rem;
  }
</style>
