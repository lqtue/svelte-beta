<!--
  ArchiveFilters.svelte — the search box, the three facet dropdowns and the
  reset link that steer a catalog list.

  Extracted from `ArchiveBrowser` (Sept 2026) so one bar can steer more than
  one list: /explore's left rail renders it once above its two tabs and hands
  the same controller to the archive browser and to the layer stack. The
  browser still renders it itself by default, so its other callers — the /scan
  map picker among them — are untouched.

  The bar owns no state: everything it reads and writes lives on the
  `CatalogSearchController` the caller passes in.

  The three facets sit inside one native `<details class="sb-more">` rather
  than three dropdowns abreast: at a 300px rail's width three selects each got
  a third of a line and read as three abbreviations. They stay three separate
  controls — area AND type AND period still combine — the disclosure just
  folds them out of the way, and its summary carries how many are set.
-->
<script lang="ts">
  import type { CatalogSearchController } from '$lib/features/shared/catalogSearch';

  /** The search engine this bar drives. Created by the caller, because the
   *  point of the component is that several lists can share one. */
  export let search: CatalogSearchController;

  const { query, areaChoices, typeChoices, periodChoices, selected } = search;

  /** How many of the three facets are set — the number on the summary. */
  $: activeFacets =
    ($selected.area?.length ? 1 : 0) +
    ($selected.type?.length ? 1 : 0) +
    ($selected.period?.length ? 1 : 0);

  $: hasFilters = !!$query.trim() || activeFacets > 0;

  function resetFilters() {
    query.set('');
    selected.set({});
  }
</script>

<div class="filters">
  <label class="sb-search">
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
    <input class="sb-search-input" type="search" placeholder="Search maps…" bind:value={$query} />
    {#if $query}
      <button
        type="button"
        class="sb-search-clear"
        on:click={() => query.set('')}
        aria-label="Clear">×</button
      >
    {/if}
  </label>
  <details class="sb-more">
    <summary
      >Filters{#if activeFacets}
        · {activeFacets}{/if}</summary
    >
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
          on:change={(e) =>
            search.setSingle('period', (e.currentTarget as HTMLSelectElement).value)}
          aria-label="Filter by period"
        >
          <option value="">All periods</option>
          {#each $periodChoices as p (p.key)}
            <option value={p.key}>{p.label}</option>
          {/each}
        </select>
      {/if}
    </div>
  </details>
</div>

{#if hasFilters}
  <div class="reset-row">
    <button type="button" class="reset" on:click={resetFilters}>Reset filters</button>
  </div>
{/if}

<style>
  /* No `gap`: `.sb-more` brings its own vertical margin, and doubling the two
     is what separates the search box from the disclosure under it. */
  .filters {
    display: flex;
    flex-direction: column;
  }
  .dropdowns {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    padding-top: 0.3rem;
  }
  .dropdowns select {
    flex: 1 1 110px;
    padding: 0.35rem 0.45rem;
    font-family: inherit;
    font-size: 0.82rem;
    background: var(--sb-card-bg);
    border: var(--border-thin);
    border-radius: var(--sb-radius-sm);
    box-shadow: 1px 1px 0 var(--shadow-ink);
    cursor: pointer;
  }

  /* Its own row, so the link sits under the bar it resets whether or not the
     list beside it has a count to show. */
  .reset-row {
    display: flex;
    justify-content: flex-end;
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
</style>
