<!--
  ReviewSidebar.svelte — Scrollable list of needs_review footprints with
  approve / reject actions. Emits 'select', 'approve', 'reject'.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { SamFootprint } from '$lib/data/supabase/footprints';

  export let footprints: SamFootprint[] = [];
  export let selectedId: string | null = null;
  export let total = 0;
  export let reviewed = 0;
  export let approving: string | null = null; // id currently being saved
  /** Pipeline mutation state — owned by ReviewMode, mirrored here for the button. */
  export let markingReviewed = false;
  export let markReviewedError = '';

  const dispatch = createEventDispatcher<{
    select: { id: string };
    approve: { id: string };
    reject: { id: string };
    retype: { id: string; featureType: string };
    markReviewed: void;
  }>();

  /** Class swatches — data, not theme: they identify a feature class on the canvas. */
  const CLASS_COLORS: Record<string, string> = {
    particulier: '#d2956e',
    communal: '#7cb87c',
    militaire: '#7ba0c8',
    local_svc: '#9c9c9c',
    non_affect: '#e8e0d0',
    building: '#2563eb',
    land_plot: '#a78bfa',
    road: '#64748b',
    waterway: '#38bdf8',
    other: '#888888',
  };

  const ALL_TYPE_LABELS: Record<string, string> = {
    particulier: 'Particulier',
    communal: 'Communal',
    militaire: 'Militaire',
    local_svc: 'Service Local',
    non_affect: 'Non Affecté',
    building: 'Building',
    land_plot: 'Land Plot',
    road: 'Road',
    waterway: 'Waterway',
    other: 'Other',
  };

  function classColor(ft: string) {
    return CLASS_COLORS[ft] ?? CLASS_COLORS.other;
  }
</script>

<aside class="review-sidebar">
  <div class="sidebar-header">
    <h2>Needs Review</h2>
    <span class="progress-pill">{reviewed} / {total} done</span>
  </div>

  {#if footprints.length === 0}
    <div class="empty">All done for this map.</div>
    {#if total > 0}
      <div class="mark-reviewed-block">
        <button
          class="btn-mark-reviewed"
          disabled={markingReviewed}
          on:click={() => dispatch('markReviewed')}
        >
          {markingReviewed ? 'Saving…' : 'Mark seg reviewed'}
        </button>
        {#if markReviewedError}
          <p class="mark-reviewed-error">{markReviewedError}</p>
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
                {#each Object.entries(ALL_TYPE_LABELS) as [value, label]}
                  <option {value}>{label}</option>
                {/each}
              </select>
              <div class="fp-actions">
                <button
                  class="btn-approve"
                  disabled={approving === fp.id}
                  on:click={() => dispatch('approve', { id: fp.id })}
                >
                  {approving === fp.id ? '…' : '✓ Approve'}
                </button>
                <button
                  class="btn-reject"
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
</aside>

<style>
  .review-sidebar {
    width: 280px;
    flex-shrink: 0;
    background: var(--color-white);
    border-left: var(--border-thin);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: var(--font-family-base);
  }

  .sidebar-header {
    padding: 1rem;
    border-bottom: var(--border-thin);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: var(--font-bold);
    color: var(--color-text);
    letter-spacing: 0.05em;
    text-transform: uppercase;
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

  .empty {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--color-gray-500);
    font-size: 0.875rem;
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
    border-radius: 3px;
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

  .fp-actions {
    width: 100%;
    display: flex;
    gap: 0.4rem;
    padding-top: 0.5rem;
  }

  .btn-approve,
  .btn-reject {
    flex: 1;
    padding: 0.35rem 0;
    font-size: 0.75rem;
    font-weight: var(--font-bold);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 0.15s;
  }

  .btn-approve:disabled,
  .btn-reject:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-approve {
    background: var(--tone-green-ink);
    color: var(--tone-green-pale);
  }

  .btn-approve:hover:not(:disabled) {
    background: var(--color-success-600);
  }

  .btn-reject {
    background: var(--tone-red-ink);
    color: var(--tone-red-pale);
  }

  .btn-reject:hover:not(:disabled) {
    background: var(--color-error-600);
  }

  .type-select {
    width: 100%;
    background: var(--color-white);
    color: var(--color-text);
    border: 1px solid var(--color-gray-300);
    border-radius: 4px;
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
  .btn-mark-reviewed {
    width: 100%;
    padding: 0.5rem;
    font-size: 0.8rem;
    font-weight: var(--font-bold);
    font-family: inherit;
    background: var(--tone-green-ink);
    color: var(--color-white);
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  .btn-mark-reviewed:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .btn-mark-reviewed:hover:not(:disabled) {
    background: var(--color-success-600);
  }
  .mark-reviewed-error {
    font-size: 0.72rem;
    color: var(--color-error-600);
    margin: 0;
  }
</style>
