<!--
  TriageRunStep.svelte — step 4 of /scan?mode=triage, plus the run history
  underneath it. "Run OCR" only ever *enqueues* a pipeline_jobs row; nothing
  happens until a worker claims it, which is what the caption says.

  Cut verbatim out of TriageSidebar.svelte. `triageDirty` and `neatlineValid`
  are computed in the parent (the verdict plate reads them too) and passed in —
  never recomputed here, or the two buttons could disagree.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let imgWidth: number = 0;

  // Two-way bound from the parent panel
  export let runId: string = '';
  export let minConfidence: number = 0.5;

  export let ocrRunning: boolean = false;
  export let ocrError: string = '';
  /** Set once the run is queued; a worker has to claim it before anything happens. */
  export let queuedJobId: string | null = null;
  export let runs: Record<string, { n: number; categories: Record<string, number> }> = {};

  /** Both computed by the parent: the verdict plate reads the same two. */
  export let triageDirty: boolean = true;
  export let neatlineValid: boolean = true;

  const dispatch = createEventDispatcher<{
    runOcr: void;
    loadRun: { runId: string };
  }>();
</script>

<div class="sb-section is-strip">
  <div class="sb-section-label"><span class="sb-step">4</span> Run OCR</div>
  <details class="sb-more">
    <summary>Run options</summary>
    <label class="sb-section">
      <span class="sb-section-label">Run ID</span>
      <input type="text" bind:value={runId} class="sb-input sb-mono" placeholder="auto-generated" />
    </label>
    <label class="sb-section">
      <span class="sb-section-label"
        >Min confidence <strong>{minConfidence.toFixed(2)}</strong></span
      >
      <input type="range" bind:value={minConfidence} min="0" max="1" step="0.05" class="ts-range" />
    </label>
  </details>

  {#if ocrError}
    <div class="empty-state error is-plate">{ocrError}</div>
  {/if}

  {#if queuedJobId}
    <div class="sb-subtitle">
      Queued as job <code>{queuedJobId.slice(0, 8)}</code>. A worker has to claim it:
      <code>python work/worker/vma_worker.py --kinds ocr</code>
    </div>
  {/if}

  <!-- Exactly one primary button at a time, and it is whichever step is next:
       Save while the triage is unsaved, Run once it is on the server. -->
  <button
    class="sb-btn is-block"
    class:is-primary={!triageDirty}
    class:is-ghost={triageDirty}
    on:click={() => dispatch('runOcr')}
    disabled={ocrRunning || !neatlineValid || !imgWidth}
  >
    {#if ocrRunning}
      <span class="spinner ts-spinner"></span> Queueing…
    {:else}
      Run OCR
    {/if}
  </button>
  <div class="sb-subtitle">Queues a job — a worker runs it and the stage flips to ocr_done.</div>
</div>

<!-- Run history -->
{#if Object.keys(runs).length > 0}
  <div class="sb-section is-strip">
    <div class="sb-section-label">Existing runs</div>
    {#each Object.entries(runs).reverse() as [rid, info] (rid)}
      <div class="ts-run-row">
        <div class="ts-run-meta">
          <code class="ts-run-id">{rid}</code>
          <span class="ts-run-n">{info.n} items</span>
        </div>
        <button class="sb-btn is-ghost is-sm" on:click={() => dispatch('loadRun', { runId: rid })}>
          Review →
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  /* The furniture every step wears — `.sb-step`, `.sb-note`, `.sb-more`,
     `.sb-mono`, `.sb-coord-grid`/`.sb-coord-label` and the boxed error face
     `.empty-state.error.is-plate` — is in $styles/components/sidebar.css.
     Only what this step alone draws is declared here. */

  /* Layout only — the slider takes the panel's ink. */
  .ts-range {
    width: 100%;
    accent-color: var(--sb-text);
  }

  /* `.spinner.on-ink` is white, for a solid blue button; `.sb-btn.is-primary`
     is a pale plate, so the spinner takes the panel's ink instead. */
  .ts-spinner {
    --spinner-size: 12px;
    --spinner-thickness: 2px;
    --spinner-track: color-mix(in srgb, var(--sb-text) 25%, transparent);
    --spinner-ink: var(--sb-text);
  }

  .ts-run-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.3rem 0;
  }
  .ts-run-meta {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .ts-run-id {
    font-size: 0.7rem;
    opacity: 0.7;
  }
  .ts-run-n {
    font-size: 0.7rem;
    opacity: 0.5;
  }
</style>
