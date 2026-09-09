<!--
  ArchiveBrowser.svelte — search box, three facet dropdowns, count and rows.

  Driven by the shared catalog engine (`$lib/features/shared/catalogSearch`) —
  the same full-text search + facet logic that powers /catalog. Draft visibility
  is enforced server-side by role, so this doesn't need its own status filter.

  It is the "Browse the full archive" branch of ExploreBrowsePanel and, since
  Sept 2026, the map picker in the /scan left rail — which is why it moved out
  of `features/explore/`. The /scan rail used to render `SearchMapsTab`, whose
  every rule is scoped under `.search-panel`: outside that container the list
  drew with no borders, no hover and titles at the inherited display size.
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { createCatalogSearch, type LabelHit } from '$lib/features/shared/catalogSearch';
  import LabelHits from '$lib/features/shared/LabelHits.svelte';
  import ArchiveMapRows from './ArchiveMapRows.svelte';

  const dispatch = createEventDispatcher<{ pickLabel: LabelHit }>();

  /** Oldest → newest comparator, supplied by the parent so both modes sort alike. */
  export let sortRows: (a: any, b: any) => number;
  /** Only maps that can be laid on the world. False for /scan?mode=inspect,
   *  where an ungeoreferenced scan is exactly what is being looked at. */
  export let requireGeoref = true;
  /** When set, only these ids are offered — the /scan?mode=review queue. */
  export let filterIds: string[] | null = null;
  /** Passed through to the rows; see `ArchiveMapRows`. */
  export let activeIds: string[] | null = null;
  export let badges: Record<string, string> = {};
  /** Label hits open /explore at a spot, which a /scan tool cannot do. */
  export let showLabels = true;

  const search = createCatalogSearch({ requireGeoref });
  const { query, results, loading, areaChoices, typeChoices, periodChoices, selected, labels } =
    search;
  onMount(() => search.start());

  $: allowed = filterIds ? new Set(filterIds) : null;
  $: shownRows = (allowed ? $results.filter((r) => allowed.has(r.id)) : [...$results]).sort(
    sortRows
  );

  $: hasFilters =
    !!$query.trim() ||
    ($selected.area?.length ?? 0) > 0 ||
    ($selected.type?.length ?? 0) > 0 ||
    ($selected.period?.length ?? 0) > 0;

  function resetFilters() {
    query.set('');
    selected.set({});
  }
</script>

<div class="filters">
  <label class="search">
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
    <input type="text" placeholder="Search maps…" bind:value={$query} />
    {#if $query}
      <button type="button" class="clear" on:click={() => query.set('')} aria-label="Clear"
        >×</button
      >
    {/if}
  </label>
  <div class="dropdowns">
    {#if $areaChoices.length}
      <select
        value={$selected.area?.[0] ?? ''}
        on:change={(e) => search.setSingle('area', (e.currentTarget as HTMLSelectElement).value)}
        aria-label="Filter by area"
      >
        <option value="">All areas</option>
        {#each $areaChoices as a (a)}
          <option value={a}>{a}</option>
        {/each}
      </select>
    {/if}
    {#if $typeChoices.length}
      <select
        value={$selected.type?.[0] ?? ''}
        on:change={(e) => search.setSingle('type', (e.currentTarget as HTMLSelectElement).value)}
        aria-label="Filter by map type"
      >
        <option value="">All types</option>
        {#each $typeChoices as t (t)}
          <option value={t}>{t}</option>
        {/each}
      </select>
    {/if}
    {#if $periodChoices.length}
      <select
        value={$selected.period?.[0] ?? ''}
        on:change={(e) => search.setSingle('period', (e.currentTarget as HTMLSelectElement).value)}
        aria-label="Filter by period"
      >
        <option value="">All periods</option>
        {#each $periodChoices as p (p.key)}
          <option value={p.key}>{p.label}</option>
        {/each}
      </select>
    {/if}
  </div>
</div>

<div class="count-row">
  <span class="count">
    {shownRows.length} map{shownRows.length === 1 ? '' : 's'}{#if $loading}<span class="loading">
        …</span
      >{/if}
  </span>
  {#if hasFilters}
    <button type="button" class="reset" on:click={resetFilters}>Reset filters</button>
  {/if}
</div>

{#if showLabels}
  <LabelHits hits={$labels} mode="pick" on:pick={(e) => dispatch('pickLabel', e.detail)} />
{/if}

{#if shownRows.length}
  <ArchiveMapRows rows={shownRows} {activeIds} {badges} on:pick on:remove />
{:else if !showLabels || !$labels.length}
  <p class="empty">No maps match those filters.</p>
{/if}

<style>
  .filters {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .search {
    flex: 1 1 160px;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem var(--space-2);
    background: var(--sb-card-bg);
    border: var(--border-thin);
    border-radius: var(--sb-radius-sm);
    box-shadow: 1px 1px 0 var(--shadow-ink);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: 0.85rem;
  }
  .clear {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1.05rem;
    color: var(--sb-text-meta);
    padding: 0 0.2rem;
  }
  .filters select {
    padding: 0.35rem 0.45rem;
    font-family: inherit;
    font-size: 0.82rem;
    background: var(--sb-card-bg);
    border: var(--border-thin);
    border-radius: var(--sb-radius-sm);
    box-shadow: 1px 1px 0 var(--shadow-ink);
    cursor: pointer;
  }

  .dropdowns {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .dropdowns select {
    flex: 1 1 110px;
  }

  .count-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .count {
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--sb-text-meta);
  }
  .reset {
    background: transparent;
    border: none;
    padding: 0;
    font: inherit;
    font-size: 0.76rem;
    font-weight: var(--font-bold);
    color: var(--sb-accent);
    text-decoration: underline;
    cursor: pointer;
  }

  .empty {
    margin: 0.4rem 0;
    color: var(--sb-text-meta);
    font-size: 0.85rem;
    font-style: italic;
  }
</style>
