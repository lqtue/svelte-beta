<!--
  ReviewSidebar.svelte — Scrollable list of needs_review footprints with
  approve / reject actions. Emits 'select', 'approve', 'reject'.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { SamFootprint } from '$lib/supabase/labels';

  export let footprints: SamFootprint[] = [];
  export let selectedId: string | null = null;
  export let total = 0;
  export let reviewed = 0;
  export let approving: string | null = null; // id currently being saved
  export let mapId: string | null = null;

  const dispatch = createEventDispatcher<{
    select: { id: string };
    approve: { id: string };
    reject: { id: string };
    retype: { id: string; featureType: string };
  }>();

  let markingReviewed = false;
  let markReviewedError = '';

  async function markSegReviewed() {
    if (!mapId) return;
    markingReviewed = true;
    markReviewedError = '';
    try {
      const res = await fetch(`/api/admin/maps/${mapId}/pipeline`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'seg_reviewed' }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e: any) {
      markReviewedError = e.message;
    } finally {
      markingReviewed = false;
    }
  }

  const CLASS_COLORS: Record<string, string> = {
    particulier: '#d2956e',
    communal:    '#7cb87c',
    militaire:   '#7ba0c8',
    local_svc:   '#9c9c9c',
    non_affect:  '#e8e0d0',
    building:    '#2563eb',
    land_plot:   '#a78bfa',
    road:        '#64748b',
    waterway:    '#38bdf8',
    other:       '#888888',
  };

  const ALL_TYPE_LABELS: Record<string, string> = {
    particulier: 'Particulier',
    communal:    'Communal',
    militaire:   'Militaire',
    local_svc:   'Service Local',
    non_affect:  'Non Affecté',
    building:    'Building',
    land_plot:   'Land Plot',
    road:        'Road',
    waterway:    'Waterway',
    other:       'Other',
  };

  function classColor(ft: string) {
    return CLASS_COLORS[ft] ?? '#888';
  }

  function fmtIou(v: number | null) {
    return v != null ? (v * 100).toFixed(0) + '%' : '–';
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <h2>Needs Review</h2>
    <span class="progress-pill">{reviewed} / {total} done</span>
  </div>

  {#if footprints.length === 0}
    <div class="empty">All done for this map.</div>
    {#if mapId && total > 0}
      <div class="mark-reviewed-block">
        <button
          class="btn-mark-reviewed"
          disabled={markingReviewed}
          on:click={markSegReviewed}
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
        <li
          class="fp-item"
          class:selected={fp.id === selectedId}
          on:click={() => dispatch('select', { id: fp.id })}
          on:keydown={(e) => e.key === 'Enter' && dispatch('select', { id: fp.id })}
          role="button"
          tabindex="0"
        >
          <span class="swatch" style="background:{classColor(fp.featureType)}"></span>
          <span class="fp-meta">
            <span class="fp-class">{fp.featureType}</span>
          </span>
          {#if fp.id === selectedId}
            <select
              class="type-select"
              value={fp.featureType}
              on:click|stopPropagation
              on:change={(e) => dispatch('retype', { id: fp.id, featureType: e.currentTarget.value })}
            >
              {#each Object.entries(ALL_TYPE_LABELS) as [value, label]}
                <option {value}>{label}</option>
              {/each}
            </select>
            <div class="fp-actions">
              <button
                class="btn-approve"
                disabled={approving === fp.id}
                on:click|stopPropagation={() => dispatch('approve', { id: fp.id })}
              >
                {approving === fp.id ? '…' : '✓ Approve'}
              </button>
              <button
                class="btn-reject"
                disabled={approving === fp.id}
                on:click|stopPropagation={() => dispatch('reject', { id: fp.id })}
              >
                ✕ Reject
              </button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .sidebar {
    width: 280px;
    flex-shrink: 0;
    background: #1a1612;
    border-left: 1px solid #2d2a26;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: "Be Vietnam Pro", sans-serif;
  }

  .sidebar-header {
    padding: 1rem;
    border-bottom: 1px solid #2d2a26;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 700;
    color: #e8e0d0;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .progress-pill {
    font-size: 0.75rem;
    font-weight: 600;
    background: #2d2a26;
    color: #9ca3af;
    border-radius: 999px;
    padding: 0.15rem 0.6rem;
    white-space: nowrap;
  }

  .empty {
    padding: 2rem 1rem;
    text-align: center;
    color: #6b7280;
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
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.625rem 1rem;
    cursor: pointer;
    border-bottom: 1px solid #2d2a26;
    flex-wrap: wrap;
    transition: background 0.1s;
  }

  .fp-item:hover { background: #231f1a; }
  .fp-item.selected { background: #2d2a26; }

  .swatch {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    flex-shrink: 0;
    margin-top: 3px;
    border: 1px solid rgba(255,255,255,0.15);
  }

  .fp-meta {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .fp-class {
    font-size: 0.8125rem;
    font-weight: 600;
    color: #d1c9be;
  }

  .fp-iou {
    font-size: 0.75rem;
    color: #6b7280;
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
    font-weight: 700;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 0.15s;
  }

  .btn-approve:disabled,
  .btn-reject:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-approve {
    background: #166534;
    color: #bbf7d0;
  }

  .btn-approve:hover:not(:disabled) { background: #15803d; }

  .btn-reject {
    background: #7f1d1d;
    color: #fecaca;
  }

  .btn-reject:hover:not(:disabled) { background: #991b1b; }

  .type-select {
    width: 100%;
    background: #2d2a26;
    color: #d1c9be;
    border: 1px solid #4b5563;
    border-radius: 4px;
    font-size: 0.75rem;
    font-family: inherit;
    padding: 0.3rem 0.4rem;
    cursor: pointer;
    margin-top: 0.35rem;
  }

  .type-select:focus {
    outline: 1px solid #f97316;
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
    font-weight: 700;
    font-family: inherit;
    background: #166534;
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  .btn-mark-reviewed:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-mark-reviewed:hover:not(:disabled) { background: #14532d; }
  .mark-reviewed-error { font-size: 0.72rem; color: #ef4444; margin: 0; }
</style>
