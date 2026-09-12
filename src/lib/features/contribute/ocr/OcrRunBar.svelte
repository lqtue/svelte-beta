<!--
  OcrRunBar.svelte — the write actions for the OCR review table. Nothing that
  only *filters* belongs here: the run picker sat among these buttons until
  Sept 2026, which is how "All runs" plus "Validate shown" came to mean
  accepting two passes at once, one of them misregistered.

  Save flushes the pending inline text/category edits; the ⟲ button is the
  two-step "that batch was a mistake" escape hatch (the parent arms it and
  renders the confirmation notice); ↻ reloads.

  Validate and Reject are a pair over one selection — the filters above decide
  which rows, these two decide the verdict. Rejecting in bulk is what the
  printed-index reads need and what previously took a script; giving it the
  same selection as Validate is what makes it safe to reach for.

  ⟲ prints what is still inside its window. The server RPC undoes 15 minutes of
  *this reviewer's* validations, and after accepting a thousand rows that
  window is the only thing between a bad batch and a re-run — so it is a
  readout, not a tooltip.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import '$styles/components/shapes-table.css';

  export let dirtyCount = 0;
  /** Pending rows the current filters show — what the two verdict buttons take. */
  export let pendingShown = 0;
  /** Ms left in the server's 15-minute revert window, 0 when nothing is in it. */
  export let revertMsLeft = 0;
  export let loading = false;
  /** True while the revert button is waiting for its confirming second click. */
  export let revertArmed = false;

  const dispatch = createEventDispatcher<{
    save: void;
    validateShown: void;
    rejectShown: void;
    revert: void;
    reload: void;
  }>();

  /** m:ss, so the window reads as a clock rather than a number of seconds. */
  $: countdown = revertMsLeft
    ? `${Math.floor(revertMsLeft / 60000)}:${String(Math.floor((revertMsLeft % 60000) / 1000)).padStart(2, '0')}`
    : '';
</script>

<div class="run-filter-bar">
  <button
    class="sb-btn is-primary is-sm"
    on:click={() => dispatch('save')}
    disabled={loading || dirtyCount === 0}
    title="Save all pending text/category edits"
  >
    Save{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
  </button>
  <button
    class="sb-btn is-success is-sm"
    on:click={() => dispatch('validateShown')}
    disabled={loading || pendingShown === 0}
    title="Validate every pending row the filters currently show. Undo with ⟲ within 15 minutes."
  >
    Validate shown{pendingShown > 0 ? ` (${pendingShown})` : ''}
  </button>
  <button
    class="sb-btn is-danger is-sm"
    on:click={() => dispatch('rejectShown')}
    disabled={loading || pendingShown === 0}
    title="Reject every pending row the filters currently show — the printed index read as map marks, a run that landed in the wrong place. Undo from the notice."
  >
    Reject shown{pendingShown > 0 ? ` (${pendingShown})` : ''}
  </button>
  <div class="run-bar-spacer"></div>
  <button
    class="sb-btn is-icon revert-btn"
    class:is-danger={revertArmed}
    on:click={() => dispatch('revert')}
    title={revertArmed
      ? 'Click again to revert everything validated in the last 15 min'
      : 'Accidental batch? Revert everything from last 15 mins'}
  >
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
    </svg>
    {#if countdown}<span class="revert-window">{countdown}</span>{/if}
  </button>
  <button
    class="sb-btn is-icon"
    on:click={() => dispatch('reload')}
    disabled={loading}
    title="Reload"
  >
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </svg>
  </button>
</div>

<style>
  .run-filter-bar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    border-bottom: var(--border-thin);
    background: var(--color-bg);
    flex-shrink: 0;
  }
  .run-bar-spacer {
    flex: 1;
  }
  /* Revert rests as a red glyph on a plain button and flips the whole button
     to `.is-danger` once armed; `:not()` outranks the shared rule either way
     round in the bundle. */
  .revert-btn:not(.is-danger) {
    color: var(--color-error-600);
  }
  /* Sits inside the icon button, so the button grows into a glyph + clock
     rather than a second control appearing beside it. */
  .revert-window {
    margin-left: 0.25rem;
    font-size: 0.62rem;
    font-variant-numeric: tabular-nums;
    font-weight: var(--font-bold);
  }
</style>
