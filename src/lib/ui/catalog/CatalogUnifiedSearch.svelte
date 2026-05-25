<!--
  CatalogUnifiedSearch.svelte — v2 unified search UI (feature-flagged via ?v=2 in /catalog).

  Owns:
    - facet selection state (institution, type, source, period, scout source/category)
    - geo-ref filter
    - "include scout queue" toggle (admin/mod only)
    - debounced fetch of /api/search on q/include changes
    - client-side filtering + everything-but-this-dimension facet tallying

  Inputs:
    searchQuery   — bind from parent's search box
    role          — 'user' | 'mod' | 'admin' (controls scout toggle visibility)
-->
<script lang="ts">
  import FacetRail from '$lib/ui/FacetRail.svelte';
  import CatalogTable from '$lib/ui/catalog/CatalogTable.svelte';
  import CatalogDetailDrawer from '$lib/ui/catalog/CatalogDetailDrawer.svelte';

  export let searchQuery: string = '';
  export let role: 'user' | 'mod' | 'admin' = 'user';
  /** When true, row clicks dispatch `pick` instead of opening the detail drawer. */
  export let pickMode: boolean = false;
  /** Compact layout: facet rail collapses to a chip strip, table loses extra cols. Suitable for narrow sidebars. */
  export let compact: boolean = false;
  /** Highlight this row as the currently-active map. */
  export let activeId: string | null = null;
  /** Restrict results to maps with georeferencing (excludes image-only entries). */
  export let requireGeoref: boolean = false;
  /** Show "+ overlay" and "B base" toggles on each row (only enabled in /view sidebar). */
  export let showLayerActions: boolean = false;

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher<{ pick: any }>();

  const V2_PERIODS = [
    { key: 'pre_colonial',   label: 'Pre-colonial (≤1858)',          from: 0,    to: 1858 },
    { key: 'early_colonial', label: 'Early colonial (1859–1887)',    from: 1859, to: 1887 },
    { key: 'belle_epoque',   label: 'Belle Époque (1888–1918)',      from: 1888, to: 1918 },
    { key: 'interwar',       label: 'Interwar (1919–1939)',          from: 1919, to: 1939 },
    { key: 'war_years',      label: 'War years (1940–1954)',         from: 1940, to: 1954 },
    { key: 'republic',       label: 'Republic era (1955–1975)',      from: 1955, to: 1975 },
    { key: 'reunification',  label: 'Reunification+ (1976–)',        from: 1976, to: 9999 },
  ];

  let selected: Record<string, string[]> = {};
  let includeScout = false;
  let periods: { key: string; label: string }[] = V2_PERIODS;
  let loading = false;
  let debounce: any = null;
  let rawMaps: any[] = [];
  let rawScout: any[] = [];

  function periodOf(year: number | null | undefined): string | null {
    if (year == null) return null;
    for (const p of V2_PERIODS) if (year >= p.from && year <= p.to) return p.key;
    return null;
  }

  const cache = new Map<string, { maps: any[]; scout: any[]; periods: any[] }>();

  function cacheKey(): string {
    return `${searchQuery.trim().toLowerCase()}|${includeScout ? 1 : 0}`;
  }

  function buildQS(): string {
    const sp = new URLSearchParams();
    if (searchQuery.trim()) sp.set('q', searchQuery.trim());
    if (includeScout) sp.set('include', 'maps,scout');
    sp.set('limit', '500');
    return sp.toString();
  }

  let inflight: AbortController | null = null;
  async function doFetch() {
    const key = cacheKey();
    const hit = cache.get(key);
    if (hit) {
      periods = hit.periods;
      rawMaps = hit.maps;
      rawScout = hit.scout;
      loading = false;
      return;
    }
    if (inflight) inflight.abort();
    inflight = new AbortController();
    loading = true;
    try {
      const res = await fetch(`/api/search?${buildQS()}`, { signal: inflight.signal });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const entry = { maps: json.maps ?? [], scout: json.scout ?? [], periods: json.periods ?? V2_PERIODS };
      cache.set(key, entry);
      periods = entry.periods;
      rawMaps = entry.maps;
      rawScout = entry.scout;
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.error('catalog search failed:', e);
    } finally {
      loading = false;
    }
  }

  function scheduleFetch() {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(doFetch, 100);
  }

  // Refetch only when q or include toggle changes.
  let mounted = false;
  $: if (mounted) { searchQuery; includeScout; scheduleFetch(); }
  import { onMount } from 'svelte';
  onMount(() => { mounted = true; doFetch(); });

  function tally(rows: any[], key: string): Record<string, number> {
    const m: Record<string, number> = {};
    for (const r of rows) {
      const v = r?.[key];
      if (v == null || v === '') continue;
      m[String(v)] = (m[String(v)] ?? 0) + 1;
    }
    return m;
  }

  function statusOf(r: any): string {
    if (r._table === 'scout') return 'scout';
    return r.georef_done ? 'map' : 'image';
  }

  $: passArea   = (r: any) => !(selected.area?.length) || selected.area.includes(String(r.location ?? ''));
  $: passType   = (r: any) => !(selected.type?.length) || selected.type.includes(String(r.map_type ?? ''));
  $: passStatus = (r: any) => !(selected.status?.length) || selected.status.includes(statusOf(r));
  $: passPeriod = (r: any) => {
    if (!selected.period?.length) return true;
    const p = periodOf(r.year);
    return p ? selected.period.includes(p) : false;
  };
  $: passScoutCat = (r: any) => !(selected.category?.length) || selected.category.includes(String(r._scout?.category ?? ''));

  $: filteredMaps  = rawMaps.filter(r => passArea(r) && passType(r) && passPeriod(r) && passStatus(r) && (!requireGeoref || !!r.georef_done));
  $: filteredScout = rawScout.filter(r => passArea(r) && passPeriod(r) && passScoutCat(r) && passStatus(r));

  $: facets = (() => {
    const mapsForArea   = rawMaps.filter(r => passType(r) && passPeriod(r) && passStatus(r));
    const mapsForType   = rawMaps.filter(r => passArea(r) && passPeriod(r) && passStatus(r));
    const mapsForStatus = rawMaps.filter(r => passArea(r) && passType(r)   && passPeriod(r));
    const mapsForPeriod = rawMaps.filter(r => passArea(r) && passType(r)   && passStatus(r));
    const periodCounts: Record<string, number> = {};
    for (const r of mapsForPeriod) {
      const p = periodOf(r.year);
      if (p) periodCounts[p] = (periodCounts[p] ?? 0) + 1;
    }
    const statusCounts: Record<string, number> = {};
    for (const r of mapsForStatus) { const s = statusOf(r); statusCounts[s] = (statusCounts[s] ?? 0) + 1; }
    const scoutForCat = rawScout.filter(r => passArea(r) && passPeriod(r));
    const scoutCatTally: Record<string, number> = {};
    for (const r of scoutForCat) { const c = r._scout?.category; if (c) scoutCatTally[c] = (scoutCatTally[c] ?? 0) + 1; }
    return {
      area:        tally(mapsForArea, 'location'),
      map_type:    tally(mapsForType, 'map_type'),
      period:      periodCounts,
      status:      statusCounts,
      scout_category: includeScout ? scoutCatTally : {},
    };
  })();

  $: results = [...filteredMaps, ...filteredScout];
  $: total = { maps: filteredMaps.length, scout: filteredScout.length };

  let openedItem: any | null = null;

  function toggleFacet(group: string, value: string) {
    const cur = new Set(selected[group] ?? []);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    selected = { ...selected, [group]: Array.from(cur) };
  }

  function handleRowFacet(e: CustomEvent<{ group: string; value: string }>) {
    const { group, value } = e.detail;
    // Only the area chip is a filter. Other clicks (year, type, etc.) are no-ops.
    if (group !== 'area') return;
    toggleFacet(group, value);
  }

  function clearGroup(group: string) {
    selected = { ...selected, [group]: [] };
  }
  $: activeAreas = selected.area ?? [];
  $: activeTypes = selected.map_type ?? [];

  /** Distinct values of a field across results that match the panel's
      `requireGeoref` constraint. Sorted by frequency desc. */
  function distinctValues(field: 'location' | 'map_type'): string[] {
    const counts: Record<string, number> = {};
    for (const r of rawMaps) {
      if (requireGeoref && !r.georef_done) continue;
      const v = (r as any)?.[field];
      if (v == null || v === '') continue;
      counts[String(v)] = (counts[String(v)] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }
  $: areaChoices = rawMaps.length || requireGeoref ? distinctValues('location') : [];
  $: typeChoices = rawMaps.length || requireGeoref ? distinctValues('map_type') : [];
  $: hasActiveFilter = activeAreas.length > 0 || activeTypes.length > 0;
</script>

<div class="v2-layout" class:compact>
  {#if !compact}
    <FacetRail
      {facets}
      {periods}
      bind:selected
      showScoutFacets={includeScout}
      on:change={scheduleFetch}
    />
  {/if}
  <div class="v2-results">
    {#if compact && (areaChoices.length > 0 || typeChoices.length > 0)}
      <div class="v2-selects">
        {#if areaChoices.length > 0}
          <label class="v2-select">
            <span class="v2-select-label">Show maps of</span>
            <select
              value={activeAreas[0] ?? ''}
              on:change={(e) => {
                const v = (e.currentTarget as HTMLSelectElement).value;
                selected = { ...selected, area: v ? [v] : [] };
              }}
            >
              <option value="">All areas</option>
              {#each areaChoices as a}
                <option value={a}>{a}</option>
              {/each}
            </select>
          </label>
        {/if}
        {#if typeChoices.length > 0}
          <label class="v2-select">
            <span class="v2-select-label">Type</span>
            <select
              value={activeTypes[0] ?? ''}
              on:change={(e) => {
                const v = (e.currentTarget as HTMLSelectElement).value;
                selected = { ...selected, map_type: v ? [v] : [] };
              }}
            >
              <option value="">All types</option>
              {#each typeChoices as t}
                <option value={t}>{t}</option>
              {/each}
            </select>
          </label>
        {/if}
      </div>
    {/if}
    {#if !compact}
      <div class="v2-toolbar">
        <span class="v2-count">
          <strong>{total.maps}</strong> in archive
          {#if includeScout}· <strong>{total.scout}</strong> in scout queue{/if}
          {#if loading}<span class="v2-loading">…</span>{/if}
        </span>
        {#if role === 'admin' || role === 'mod'}
          <label class="v2-scout-toggle">
            <input type="checkbox" bind:checked={includeScout} />
            Include scout queue
          </label>
        {/if}
      </div>
    {/if}
    {#if results.length === 0 && !loading}
      <div class="state-panel">
        <div class="empty-emoji">🏜️</div>
        <h2 class="state-title">No matches</h2>
        <p class="state-desc">Try a different keyword or clear a filter.</p>
      </div>
    {:else}
      <CatalogTable
        items={results}
        {compact}
        {activeId}
        {showLayerActions}
        on:open={(e) => pickMode ? dispatch('pick', e.detail) : (openedItem = e.detail)}
        on:facet={handleRowFacet}
      />
    {/if}
  </div>
</div>

{#if !pickMode}
  <CatalogDetailDrawer item={openedItem} on:close={() => (openedItem = null)} />
{/if}

<style>
  .v2-layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 1.25rem;
    align-items: start;
  }
  .v2-layout.compact { grid-template-columns: 1fr; gap: 0.5rem; }
  .v2-layout.compact .v2-toolbar { font-size: 0.78rem; padding: 0.35rem 0.55rem; }
  .v2-results { display: flex; flex-direction: column; gap: 0.75rem; }
  .v2-toolbar {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.5rem 0.75rem;
    background: #fff;
    border: 1.5px solid #111; border-radius: 6px;
    font-family: 'Outfit', sans-serif; font-size: 0.85rem;
  }
  .v2-count strong { font-weight: 800; }
  .v2-loading { margin-left: 0.4rem; opacity: 0.6; }
  .v2-scout-toggle {
    display: inline-flex; align-items: center; gap: 0.35rem;
    font-weight: 700;
    cursor: pointer;
  }
  .v2-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
  }
  .v2-selects {
    display: flex; flex-wrap: wrap; gap: 0.5rem;
    font-family: 'Outfit', sans-serif;
  }
  .v2-select {
    flex: 1 1 140px;
    min-width: 0;
    display: flex; flex-direction: column; gap: 0.2rem;
  }
  .v2-select-label {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.62rem; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.05em;
    color: #555;
  }
  .v2-select select {
    width: 100%;
    min-height: 38px;
    padding: 0.35rem 0.55rem;
    background: #fff;
    border: 1.5px solid #111; border-radius: 6px;
    font: inherit; font-family: 'Outfit', sans-serif;
    font-size: 0.85rem; font-weight: 700;
    color: #111;
    cursor: pointer;
  }

  .state-panel { text-align: center; padding: 3rem 1rem; }
  .empty-emoji { font-size: 3rem; }
  .state-title { font-family: 'Space Grotesk', sans-serif; font-weight: 800; margin: 0.5rem 0; }
  .state-desc { color: #555; }
  @media (max-width: 900px) {
    .v2-layout { grid-template-columns: 1fr; }
  }
</style>
