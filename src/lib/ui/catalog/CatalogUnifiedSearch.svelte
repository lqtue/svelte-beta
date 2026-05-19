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
  import SearchResultCard from '$lib/ui/SearchResultCard.svelte';

  export let searchQuery: string = '';
  export let role: 'user' | 'mod' | 'admin' = 'user';

  const V2_PERIODS = [
    { key: 'pre_colonial',   label: 'Pre-colonial (≤1858)',          from: 0,    to: 1858 },
    { key: 'early_colonial', label: 'Early colonial (1859–1887)',    from: 1859, to: 1887 },
    { key: 'indochina',      label: 'French Indochina (1888–1939)',  from: 1888, to: 1939 },
    { key: 'war_years',      label: 'War years (1940–1954)',         from: 1940, to: 1954 },
    { key: 'republic',       label: 'Republic era (1955–1975)',      from: 1955, to: 1975 },
    { key: 'reunification',  label: 'Reunification+ (1976–)',        from: 1976, to: 9999 },
  ];

  let selected: Record<string, string[]> = {};
  let georef: string | null = null;
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

  function buildQS(): string {
    const sp = new URLSearchParams();
    if (searchQuery.trim()) sp.set('q', searchQuery.trim());
    if (includeScout) sp.set('include', 'maps,scout');
    sp.set('limit', '500');
    return sp.toString();
  }

  async function doFetch() {
    loading = true;
    try {
      const res = await fetch(`/api/search?${buildQS()}`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      periods = json.periods ?? V2_PERIODS;
      rawMaps = json.maps ?? [];
      rawScout = json.scout ?? [];
    } catch (e) {
      console.error('catalog search failed:', e);
    } finally {
      loading = false;
    }
  }

  function scheduleFetch() {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(doFetch, 180);
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

  $: passInst   = (r: any) => !(selected.institution?.length) || selected.institution.includes(String(r.holding_institution ?? ''));
  $: passType   = (r: any) => !(selected.type?.length)        || selected.type.includes(String(r.map_type ?? ''));
  $: passSource = (r: any) => !(selected.source?.length)      || selected.source.includes(String(r.source_type ?? ''));
  $: passPeriod = (r: any) => {
    if (!selected.period?.length) return true;
    const p = periodOf(r.year);
    return p ? selected.period.includes(p) : false;
  };
  $: passGeoref = (r: any) => !georef || (georef === 'yes' ? !!r.allmaps_id : !r.allmaps_id);
  $: passScoutSrc = (r: any) => !(selected.scoutSource?.length) || selected.scoutSource.includes(String(r._scout?.source ?? ''));
  $: passScoutCat = (r: any) => !(selected.category?.length)    || selected.category.includes(String(r._scout?.category ?? ''));

  $: filteredMaps  = rawMaps.filter(r => passInst(r) && passType(r) && passSource(r) && passPeriod(r) && passGeoref(r));
  $: filteredScout = rawScout.filter(r => passInst(r) && passPeriod(r) && passScoutSrc(r) && passScoutCat(r));

  $: facets = (() => {
    const mapsForInst   = rawMaps.filter(r => passType(r) && passSource(r) && passPeriod(r) && passGeoref(r));
    const mapsForType   = rawMaps.filter(r => passInst(r) && passSource(r) && passPeriod(r) && passGeoref(r));
    const mapsForSource = rawMaps.filter(r => passInst(r) && passType(r)   && passPeriod(r) && passGeoref(r));
    const mapsForPeriod = rawMaps.filter(r => passInst(r) && passType(r)   && passSource(r) && passGeoref(r));
    const periodCounts: Record<string, number> = {};
    for (const r of mapsForPeriod) {
      const p = periodOf(r.year);
      if (p) periodCounts[p] = (periodCounts[p] ?? 0) + 1;
    }
    const scoutForSrc = rawScout.filter(r => passScoutCat(r) && passInst(r) && passPeriod(r));
    const scoutForCat = rawScout.filter(r => passScoutSrc(r) && passInst(r) && passPeriod(r));
    const scoutSrcTally: Record<string, number> = {};
    const scoutCatTally: Record<string, number> = {};
    for (const r of scoutForSrc) { const s = r._scout?.source; if (s) scoutSrcTally[s] = (scoutSrcTally[s] ?? 0) + 1; }
    for (const r of scoutForCat) { const c = r._scout?.category; if (c) scoutCatTally[c] = (scoutCatTally[c] ?? 0) + 1; }
    return {
      institution: tally(mapsForInst, 'holding_institution'),
      map_type:    tally(mapsForType, 'map_type'),
      source_type: tally(mapsForSource, 'source_type'),
      period:      periodCounts,
      scout_source:   includeScout ? scoutSrcTally : {},
      scout_category: includeScout ? scoutCatTally : {},
    };
  })();

  $: georefCounts = (() => {
    const base = rawMaps.filter(r => passInst(r) && passType(r) && passSource(r) && passPeriod(r));
    return { yes: base.filter(r => !!r.allmaps_id).length, no: base.filter(r => !r.allmaps_id).length };
  })();

  $: results = [...filteredMaps, ...filteredScout];
  $: total = { maps: filteredMaps.length, scout: filteredScout.length };

  function onFacetChip(e: CustomEvent<{ group: string; value: string }>) {
    const { group, value } = e.detail;
    const cur = new Set(selected[group] ?? []);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    selected = { ...selected, [group]: Array.from(cur) };
  }

  function handleScoutChanged(e: CustomEvent<{ id: string; status: string }>) {
    rawScout = rawScout.filter(r => !(r._table === 'scout' && r._scout?.id === e.detail.id));
  }
</script>

<div class="v2-layout">
  <FacetRail
    {facets}
    {periods}
    bind:selected
    bind:georef
    {georefCounts}
    showScoutFacets={includeScout}
    on:change={scheduleFetch}
  />
  <div class="v2-results">
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
    {#if results.length === 0 && !loading}
      <div class="state-panel">
        <div class="empty-emoji">🏜️</div>
        <h2 class="state-title">No matches</h2>
        <p class="state-desc">Try a different keyword or clear a filter.</p>
      </div>
    {:else}
      <div class="v2-grid">
        {#each results as item (item.id)}
          <SearchResultCard
            {item}
            canAdminScout={role === 'admin' || role === 'mod'}
            on:facet={onFacetChip}
            on:scoutChanged={handleScoutChanged}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .v2-layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 1.25rem;
    align-items: start;
  }
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
  .state-panel { text-align: center; padding: 3rem 1rem; }
  .empty-emoji { font-size: 3rem; }
  .state-title { font-family: 'Space Grotesk', sans-serif; font-weight: 800; margin: 0.5rem 0; }
  .state-desc { color: #555; }
  @media (max-width: 900px) {
    .v2-layout { grid-template-columns: 1fr; }
  }
</style>
