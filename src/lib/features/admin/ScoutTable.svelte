<!--
  ScoutTable.svelte — the dense view of the same queue the card grid shows.

  A thousand rows is more than a picture wall can hold in the head: the table
  is for scanning, sorting and spotting the near-duplicate titles that sit
  three sources apart. It renders `.data-table.is-dense` (table.css) — the same
  table the contribute sidebars use — and shares ScoutDecision with the grid,
  so a verdict behaves identically in both.

  Sorting is the server's (`?order=&dir=` on /api/admin/scout), not this
  component's: the page holds 60 of 1037 rows, and re-ordering only those would
  put the oldest sheet *on this page* under a heading that claims it is the
  oldest in the queue.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import ScoutDecision, { type Verdict } from '$lib/features/admin/ScoutDecision.svelte';
  import { hasImageSource, type ScoutCandidate } from '$lib/features/admin/ScoutCard.svelte';

  export let rows: ScoutCandidate[] = [];
  export let selected: Set<string> = new Set();
  /** Index of the page-level keyboard cursor within `rows`, or -1. */
  export let focusIdx = -1;
  /** Current server sort, so the header can show which column is active. */
  export let orderBy = 'year';
  export let orderDir: 'asc' | 'desc' = 'asc';

  const dispatch = createEventDispatcher<{
    toggle: string;
    sort: string;
    decide: { id: string; status: Verdict; note: string | null };
  }>();

  const COLUMNS = [
    { key: 'year', label: 'Year' },
    { key: 'title', label: 'Title' },
    { key: 'source', label: 'Source' },
    { key: 'category', label: 'Type' },
    { key: 'holding_institution', label: 'Held by' },
  ];

  const arrow = (key: string) => (orderBy !== key ? '' : orderDir === 'asc' ? ' ↑' : ' ↓');

  /** Keeps the j/k cursor in view without the page needing a row reference. */
  function cursor(node: HTMLElement, isCursor: boolean) {
    const show = (on: boolean) => on && node.scrollIntoView({ block: 'nearest' });
    show(isCursor);
    return { update: show };
  }
</script>

<div class="table-wrap">
  <table class="data-table is-dense scout-table">
    <thead>
      <tr>
        <th class="col-check" aria-label="Select"></th>
        <th class="col-thumb" aria-label="Preview"></th>
        {#each COLUMNS as col (col.key)}
          <th class="sortable" on:click={() => dispatch('sort', col.key)}>
            {col.label}{arrow(col.key)}
          </th>
        {/each}
        <th class="col-decide">Decision</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as c, i (c.id)}
        <tr
          class:is-selected={selected.has(c.id)}
          class:is-cursor={i === focusIdx}
          use:cursor={i === focusIdx}
        >
          <td class="col-check">
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              on:change={() => dispatch('toggle', c.id)}
              aria-label="Select {c.title}"
            />
          </td>
          <td class="col-thumb">
            {#if c.thumbnail}
              <a href={c.source_url || c.manifest_url || '#'} target="_blank" rel="noopener">
                <img src={c.thumbnail} alt="" loading="lazy" />
              </a>
            {/if}
          </td>
          <td class="num">{c.year ?? '—'}</td>
          <td class="col-title">
            <a href={c.source_url || c.manifest_url || '#'} target="_blank" rel="noopener">
              {c.title}
            </a>
            {#if !hasImageSource(c)}
              <span
                class="badge-chip chip-yellow is-flag"
                title="No IIIF manifest or image URL — ingest will refuse it">no image</span
              >
            {/if}
            {#if c.review_note}<em class="row-note" title={c.review_note}>“{c.review_note}”</em
              >{/if}
          </td>
          <td>{c.source}</td>
          <td>{c.category || '—'}</td>
          <td class="col-holder" title={c.holding_institution || ''}>
            {c.holding_institution || '—'}
          </td>
          <td class="col-decide">
            <ScoutDecision
              status={c.status}
              note={null}
              on:decide={(e) => dispatch('decide', { id: c.id, ...e.detail })}
            />
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if !rows.length}
    <p class="table-empty">No candidates match these filters.</p>
  {/if}
</div>
