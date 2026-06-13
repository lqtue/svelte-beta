<!--
  ExploreBrowsePanel.svelte — map list for /explore, with an in-place "show
  all" expansion.

  Default view: just the maps that cover the user's location (GPS coverage),
  with a big tick-circle first cell for add/remove. "Browse the full archive →"
  toggles the panel into a wider mode driven by the shared catalog engine
  (`$lib/catalog/catalogSearch`) — the same full-text search + facet logic that
  powers /catalog — restricted to georeferenced maps since only those overlay.
  Rows behave identically in both modes — tap to add, tap again to remove.
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { layersStore } from '$lib/stores/layersStore';
  import type { ResolvedMap } from './spatialLookup';
  import { createCatalogSearch } from '$lib/catalog/catalogSearch';

  export let matches: ResolvedMap[] = [];
  // Admins/mods may browse draft maps in the viewer; everyone else is
  // capped to public/featured (mirrors /catalog's role gating).
  export let role: 'user' | 'mod' | 'admin' = 'user';
  // When the parent's welcome-mode is "Show all maps", force-expand so the
  // user lands on the full archive immediately. When the parent's mode is
  // location-based, leave `expanded` user-controlled — never auto-expand on
  // empty matches, since that hides the location's "no map here" status
  // after the tour ends.
  export let forceExpanded = false;

  const dispatch = createEventDispatcher<{
    pick: { map: any };
    remove: { mapId: string };
  }>();

  // Shared catalog engine. Draft visibility is enforced server-side by role,
  // so the expanded archive doesn't need its own status filter.
  const search = createCatalogSearch({ requireGeoref: true });
  const { query, results, loading, areaChoices, typeChoices, periodChoices, selected } = search;
  onMount(() => search.start());

  let expanded = false;

  // Parent owns the "Show all maps" decision. When it flips on, expand;
  // when off, leave whatever the user chose manually.
  $: if (forceExpanded) expanded = true;

  $: stackedIds = new Set($layersStore.overlays.map((o) => o.ref.mapId));

  // Oldest → newest, matching /catalog's default sort. Undated maps sink
  // to the bottom; ties break by name so the order is stable.
  function byYear(a: { year?: number | null; name?: string }, b: { year?: number | null; name?: string }): number {
    const ay = a.year ?? Infinity;
    const by = b.year ?? Infinity;
    if (ay !== by) return ay - by;
    return (a.name ?? '').localeCompare(b.name ?? '');
  }

  // Default view: maps covering the user's GPS spot. `matches` comes from the
  // RLS-readable map list (which leaks drafts), so role-gate it here too.
  $: canSeeDrafts = role === 'admin' || role === 'mod';
  $: visibleMatches = [...matches]
    .filter((m) => canSeeDrafts || m.status === 'public' || m.status === 'featured')
    .sort(byYear);

  $: shownRows = expanded ? [...$results].sort(byYear) : visibleMatches;

  $: hasFilters =
    !!$query.trim() ||
    ($selected.area?.length ?? 0) > 0 ||
    ($selected.type?.length ?? 0) > 0 ||
    ($selected.period?.length ?? 0) > 0;

  function resetFilters() {
    query.set('');
    selected.set({});
  }

  // Stable colour per map_type so the type chip is scannable. Hashes the
  // string to a hue (golden-angle stepped to keep adjacent types distinct).
  function hueFor(t: string | undefined): number {
    if (!t) return 50;
    let h = 0;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
    return Math.abs(h * 137) % 360;
  }
  function typeStyle(t: string | undefined): string {
    if (!t) return '';
    const h = hueFor(t);
    return `background: hsl(${h} 70% 88%); border-color: hsl(${h} 45% 30%); color: hsl(${h} 50% 22%);`;
  }

  function onRowClick(map: any) {
    if (stackedIds.has(map.id)) {
      dispatch('remove', { mapId: map.id });
    } else {
      dispatch('pick', { map });
    }
  }
</script>

<div class="ebp" class:is-expanded={expanded}>
  <div class="head">
    <strong class="title">
      {#if expanded}
        Browse the archive
      {:else if matches.length}
        {matches.length} map{matches.length === 1 ? '' : 's'} cover this spot
      {:else}
        No archival map here
      {/if}
    </strong>
    {#if !expanded && matches.length}
      <span class="hint">Tap a row to add it as a layer · tap again to remove.</span>
    {/if}
  </div>

  {#if expanded}
    <div class="filters">
      <label class="search">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input type="text" placeholder="Search maps…" bind:value={$query} />
        {#if $query}
          <button type="button" class="clear" on:click={() => query.set('')} aria-label="Clear">×</button>
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
            {#each $areaChoices as a}
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
            {#each $typeChoices as t}
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
            {#each $periodChoices as p}
              <option value={p.key}>{p.label}</option>
            {/each}
          </select>
        {/if}
      </div>
    </div>
    <div class="count-row">
      <span class="count">
        {shownRows.length} map{shownRows.length === 1 ? '' : 's'}{#if $loading}<span class="loading"> …</span>{/if}
      </span>
      {#if hasFilters}
        <button type="button" class="reset" on:click={resetFilters}>Reset filters</button>
      {/if}
    </div>
  {/if}

  {#if shownRows.length}
    <ul class="rows">
      {#each shownRows as m (m.id)}
        {@const on = stackedIds.has(m.id)}
        <li>
          <button type="button" class="row" class:is-on={on} on:click={() => onRowClick(m)}>
            <span class="tick" aria-hidden="true" class:on>
              {#if on}
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12.5l5 5L20 7" />
                </svg>
              {:else}
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              {/if}
            </span>
            <span class="year-cell">{m.year ?? '—'}</span>
            <span class="name">{m.name}</span>
            <span class="type-cell">
              {#if m.map_type}
                <span class="type-chip" style={typeStyle(m.map_type)}>{m.map_type}</span>
              {/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if expanded}
    <p class="empty">No maps match those filters.</p>
  {/if}

  <button
    type="button"
    class="browse-toggle"
    on:click={() => { expanded = !expanded; if (!expanded) resetFilters(); }}
  >
    {#if expanded}
      ← Back to maps at this location
    {:else}
      Browse the full archive →
    {/if}
  </button>
</div>

<style>
  .ebp {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 0.6rem 0.7rem 0.8rem;
    font-family: var(--sb-font-base);
  }
  .head { display: flex; flex-direction: column; gap: 0.15rem; }
  .title {
    font-family: var(--sb-font-display);
    font-size: var(--text-base);
    font-weight: var(--font-extrabold);
  }
  .hint { color: var(--sb-text-meta); font-size: 0.78rem; }

  .filters { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .search {
    flex: 1 1 160px;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.5rem;
    background: var(--sb-card-bg);
    border: var(--border-thin);
    border-radius: var(--sb-radius-sm);
    box-shadow: 1px 1px 0 var(--color-border);
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
    box-shadow: 1px 1px 0 var(--color-border);
    cursor: pointer;
  }

  .dropdowns { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .dropdowns select { flex: 1 1 110px; }

  .count-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
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

  .rows {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .row {
    display: grid;
    grid-template-columns: 32px 3rem 1fr auto;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-height: 52px;
    text-align: left;
    padding: 0.55rem;
    background: var(--sb-bg);
    border: var(--sb-border);
    border-radius: var(--sb-radius-sm);
    font-family: inherit;
    cursor: pointer;
  }
  .row:active { background: #f3f1ea; }
  .row.is-on { background: var(--sb-success-bg); }

  .tick {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--sb-card-bg);
    border: var(--sb-border);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--sb-text);
    flex-shrink: 0;
  }
  .tick.on {
    background: var(--sb-success);
    color: var(--color-white);
    border-color: #064e3b;
  }

  .year-cell {
    font-size: 0.82rem;
    font-weight: var(--font-bold);
    color: var(--sb-accent);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .name {
    font-size: 0.85rem;
    line-height: 1.3;
    color: var(--sb-text);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-width: 0;
  }
  .type-cell { display: flex; justify-content: flex-end; min-width: 0; }
  .type-chip {
    padding: 0.15rem 0.5rem;
    background: var(--sb-accent-yellow);
    border: var(--sb-border);
    border-radius: var(--sb-radius-pill);
    font-size: 0.7rem;
    font-weight: var(--font-bold);
    text-transform: capitalize;
    white-space: nowrap;
  }

  .empty {
    margin: 0.4rem 0;
    color: var(--sb-text-meta);
    font-size: 0.85rem;
    font-style: italic;
  }

  .browse-toggle {
    align-self: flex-start;
    margin-top: 0.3rem;
    padding: 0.45rem 0.7rem;
    background: transparent;
    border: none;
    color: var(--sb-accent);
    text-decoration: none;
    font-family: inherit;
    font-size: 0.84rem;
    font-weight: var(--font-bold);
    cursor: pointer;
    border-bottom: 1.5px dashed var(--sb-accent);
  }
  .browse-toggle:hover { color: #1e3a8a; }
</style>
