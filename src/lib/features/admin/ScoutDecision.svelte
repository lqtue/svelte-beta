<!--
  ScoutDecision.svelte — the approve/reject control, shared by the card grid
  and the table so a decision looks and behaves the same in both.

  Two states. Idle shows Approve / Reject (or the current verdict, with a way
  back). Asking shows preset reasons plus a free-text box: Enter commits,
  Escape cancels, and committing with nothing typed is allowed — an obvious
  row should not cost a sentence.
-->
<script lang="ts" context="module">
  export type Verdict = 'approved' | 'rejected' | 'pending';

  /** The reasons that actually recur when sweeping the queue. */
  export const REJECT_REASONS = [
    'not a map',
    'not Vietnam',
    'duplicate',
    'poor scan',
    'wrong period',
  ];
  export const APPROVE_REASONS = ['priority sheet', 'fills a gap', 'better copy'];

  /** The shared badge tone for each resolved verdict — `.sd-verdict` used to
   *  restate `.chip-green` / `.chip-red` / `.chip-blue` under its own name. */
  const VERDICT_TONE: Record<Verdict | 'ingested', string> = {
    pending: '',
    approved: 'chip-green',
    rejected: 'chip-red',
    ingested: 'chip-blue',
  };
</script>

<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';

  export let status: Verdict | 'ingested' = 'pending';
  export let note: string | null = null;

  const dispatch = createEventDispatcher<{
    decide: { status: Verdict; note: string | null };
  }>();

  let asking: Verdict | null = null;
  let draft = '';
  let input: HTMLInputElement | undefined;

  $: presets = asking === 'rejected' ? REJECT_REASONS : APPROVE_REASONS;

  async function ask(next: Verdict) {
    asking = next;
    draft = '';
    await tick();
    input?.focus();
  }

  function commit() {
    if (!asking) return;
    dispatch('decide', { status: asking, note: draft.trim() || null });
    asking = null;
    draft = '';
  }

  function cancel() {
    asking = null;
    draft = '';
  }

  function onKey(e: KeyboardEvent) {
    // The page-level j/k/a/r handler ignores inputs, so these keys are ours.
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  /** A preset both fills the box and commits — one click for the common case. */
  function pick(reason: string) {
    draft = reason;
    commit();
  }
</script>

{#if asking}
  <div class="sd-ask">
    <span class="sd-ask-label">
      {asking === 'rejected' ? 'Reject' : 'Approve'} — why? <em>(optional)</em>
    </span>
    <div class="sd-presets">
      {#each presets as reason (reason)}
        <button type="button" class="btn btn-xs" on:click={() => pick(reason)}>{reason}</button>
      {/each}
    </div>
    <input
      bind:this={input}
      bind:value={draft}
      class="sb-input sd-note"
      type="text"
      placeholder="or type a reason…"
      on:keydown={onKey}
    />
    <div class="sd-ask-actions">
      <button
        type="button"
        class="btn btn-xs {asking === 'rejected' ? 'btn-danger' : 'btn-success'}"
        on:click={commit}>Confirm</button
      >
      <button type="button" class="btn btn-xs btn-ghost" on:click={cancel}>Cancel</button>
    </div>
  </div>
{:else if status === 'pending'}
  <div class="sd-actions">
    <button type="button" class="btn btn-xs btn-success" on:click={() => ask('approved')}>
      Approve
    </button>
    <button type="button" class="btn btn-xs btn-danger" on:click={() => ask('rejected')}>
      Reject
    </button>
  </div>
{:else}
  <div class="sd-actions">
    <span class="badge-chip is-sm {VERDICT_TONE[status]}">{status}</span>
    {#if status !== 'ingested'}
      <button
        type="button"
        class="btn btn-xs btn-ghost"
        on:click={() => dispatch('decide', { status: 'pending', note: null })}
      >
        ↺ Revert
      </button>
    {/if}
  </div>
  {#if note}
    <p class="sd-note-shown" title={note}>“{note}”</p>
  {/if}
{/if}
