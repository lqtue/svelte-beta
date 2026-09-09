<!--
  ReviewSidebar.svelte — Scrollable list of needs_review footprints with
  approve / reject actions. Emits 'select', 'approve', 'reject'.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { SamFootprint } from '$lib/data/supabase/footprints';
  import { FEATURE_TYPE_COLORS, FEATURE_TYPE_LABELS } from '$lib/data/maps/footprintTypes';

  export let footprints: SamFootprint[] = [];
  export let selectedId: string | null = null;
  export let total = 0;
  export let reviewed = 0;
  export let approving: string | null = null; // id currently being saved
  /** Pipeline mutation state — owned by ReviewPage, mirrored here for the button. */
  export let markingReviewed = false;
  export let markReviewedError = '';

  const dispatch = createEventDispatcher<{
    select: { id: string };
    approve: { id: string };
    reject: { id: string };
    retype: { id: string; featureType: string };
    markReviewed: void;
  }>();

  /** The cadastral classes this queue also sees, on top of the feature types.
      Swatches are data, not theme: they identify a class on the canvas. */
  const CLASS_COLORS: Record<string, string> = {
    particulier: '#d2956e',
    communal: '#7cb87c',
    militaire: '#7ba0c8',
    local_svc: '#9c9c9c',
    non_affect: '#e8e0d0',
    ...FEATURE_TYPE_COLORS,
  };

  const ALL_TYPE_LABELS: Record<string, string> = {
    particulier: 'Particulier',
    communal: 'Communal',
    militaire: 'Militaire',
    local_svc: 'Service Local',
    non_affect: 'Non Affecté',
    ...FEATURE_TYPE_LABELS,
  };

  function classColor(ft: string) {
    return CLASS_COLORS[ft] ?? CLASS_COLORS.other;
  }
</script>

<div class="review-panel">
  <div class="sb-row is-strip">
    <span class="sb-grow progress-label">Progress</span>
    <span class="progress-pill">{reviewed} / {total} done</span>
  </div>

  {#if footprints.length === 0}
    <p class="empty-state is-block">All done for this map.</p>
    {#if total > 0}
      <div class="mark-reviewed-block">
        <button
          class="sb-btn is-success is-block"
          disabled={markingReviewed}
          on:click={() => dispatch('markReviewed')}
        >
          {markingReviewed ? 'Saving…' : 'Mark seg reviewed'}
        </button>
        {#if markReviewedError}
          <p class="empty-state error">{markReviewedError}</p>
        {/if}
      </div>
    {/if}
  {:else}
    <ul class="fp-list">
      {#each footprints as fp (fp.id)}
        <li class="fp-item" class:selected={fp.id === selectedId}>
          <!-- The row itself is the select control, so it is a real button. -->
          <button type="button" class="fp-main" on:click={() => dispatch('select', { id: fp.id })}>
            <span class="swatch" style="background:{classColor(fp.featureType)}"></span>
            <span class="fp-class">{fp.featureType}</span>
          </button>

          {#if fp.id === selectedId}
            <div class="fp-extra">
              <select
                class="type-select"
                value={fp.featureType}
                on:change={(e) =>
                  dispatch('retype', { id: fp.id, featureType: e.currentTarget.value })}
              >
                {#each Object.entries(ALL_TYPE_LABELS) as [value, label] (value)}
                  <option {value}>{label}</option>
                {/each}
              </select>
              <div class="fp-actions">
                <button
                  class="sb-btn is-success is-sm"
                  disabled={approving === fp.id}
                  on:click={() => dispatch('approve', { id: fp.id })}
                >
                  {approving === fp.id ? '…' : '✓ Approve'}
                </button>
                <button
                  class="sb-btn is-danger is-sm"
                  disabled={approving === fp.id}
                  on:click={() => dispatch('reject', { id: fp.id })}
                >
                  ✕ Reject
                </button>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* `.panel` (ToolSidebarShell) owns the frame; this is only the body. */
  .review-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: var(--font-family-base);
  }

  /* `.sb-row.is-strip` (sidebar.css) carries the padded divider band; this is
     only the small meta label `.tool-label` used to supply. */
  .progress-label {
    font-size: 0.72rem;
    color: var(--sb-text-meta);
  }

  .progress-pill {
    font-size: 0.75rem;
    font-weight: var(--font-semibold);
    background: var(--color-gray-100);
    color: var(--color-gray-500);
    border-radius: var(--radius-pill);
    padding: 0.15rem 0.6rem;
    white-space: nowrap;
  }

  .fp-list {
    list-style: none;
    padding: 0;
    margin: 0;
    overflow-y: auto;
    flex: 1;
  }

  .fp-item {
    border-bottom: 1px solid var(--color-gray-300);
    transition: background 0.1s;
  }

  .fp-item:hover {
    background: var(--color-gray-100);
  }
  .fp-item.selected {
    background: var(--tone-blue-wash);
  }

  .fp-main {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    width: 100%;
    padding: 0.625rem 1rem;
    background: none;
    border: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .swatch {
    width: 12px;
    height: 12px;
    border-radius: var(--sb-radius-sm);
    flex-shrink: 0;
    margin-top: 3px;
    border: 1px solid color-mix(in srgb, var(--color-border) 15%, transparent);
  }

  .fp-class {
    flex: 1;
    font-size: 0.8125rem;
    font-weight: var(--font-semibold);
    color: var(--color-text);
  }

  .fp-extra {
    display: flex;
    flex-direction: column;
    padding: 0 1rem 0.625rem;
  }

  /* Grid, not flex: the two buttons share the row evenly without either of
     them needing a `flex` of its own on top of `.sb-btn`. */
  .fp-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
    padding-top: 0.5rem;
  }

  .type-select {
    width: 100%;
    background: var(--color-white);
    color: var(--color-text);
    border: 1px solid var(--color-gray-300);
    border-radius: var(--sb-radius-sm);
    font-size: 0.75rem;
    font-family: inherit;
    padding: 0.3rem 0.4rem;
    cursor: pointer;
    margin-top: 0.35rem;
  }

  .type-select:focus {
    outline: 1px solid var(--color-orange);
    outline-offset: -1px;
  }

  .mark-reviewed-block {
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
</style>
