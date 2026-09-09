<!--
  ExploreRightSidebar.svelte — desktop right rail for /explore.

  Mirrors ExploreSidebar exactly: crown, one search bar, a .sb-pill tab strip,
  one card that swaps its body. Left rail is the archive; this one is the sheet
  on top of the stack.

    ┌ This sheet ─────────────────── ⇥ ┐
    │ ⌕ Search a place…                │  PlaceSearchBar
    │ ( Info ) ( Legend ) ( Control )  │
    │ …metadata, legend rows, controls…│
    └──────────────────────────────────┘

  The search is at the top rather than inside Control because it is how you get
  anywhere on the map — the same job the left rail's filter bar does for the
  archive. `LayerControlsPanel` therefore takes `showSearch={false}` here, or
  the Control tab would show a second one.

  Info carries TopSheetActions (⬡ Traced · Scan · Annotate · Share). Those four
  sat above the tab strip until Sept 2026, where they pushed the tabs down and
  belonged to no tab.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ViewMode } from '$lib/map/types';
  import type { MapListItem } from '$lib/data/maps/types';
  import LayerControlsPanel from '$lib/features/shared/LayerControlsPanel.svelte';
  import SidebarCard from '$lib/features/shared/SidebarCard.svelte';
  import TopSheetActions from '$lib/features/shared/TopSheetActions.svelte';
  import PlaceSearchBar from '$lib/features/shared/PlaceSearchBar.svelte';

  const dispatch = createEventDispatcher<{
    toggleCollapse: void;
    changeViewMode: { mode: ViewMode };
    pickLocation: { lat: number; lng: number; label: string };
    toggleGps: void;
    toggleLegendPoints: void;
    toggleVectors: { mapId: string };
  }>();

  export let viewMode: ViewMode = 'overlay';
  export let gpsActive = false;
  /** Top overlay's map id — what Legend and Info describe. */
  export let mapId: string | null = null;
  /** Same map, resolved against the loaded list, for the Info tab. */
  export let map: MapListItem | null = null;
  export let showLegendPoints = false;
  /** Whether the top sheet's traced fabric is drawn — owned by the page. */
  export let vectorsOn = false;

  type Tab = 'info' | 'legend' | 'control';
  const TABS: { key: Tab; label: string }[] = [
    { key: 'info', label: 'Info' },
    { key: 'legend', label: 'Legend' },
    { key: 'control', label: 'Control' },
  ];
  let tab: Tab = 'info';

  type LegendPoint = {
    n: number;
    name: string | null;
    vn: string | null;
    grid: string | null;
    lng: number;
    lat: number;
    accuracy_m?: number;
  };

  let legend: LegendPoint[] = [];
  let legendFor = '';
  let legendLoading = false;

  async function loadLegend(id: string) {
    // ponytail: the same GET LegendPointsLayer makes, so a sheet with the tab
    // open fetches it twice. One small request per map — give it a store if a
    // third reader turns up.
    legendFor = id;
    legendLoading = true;
    try {
      const res = await fetch(`/api/maps/${id}/legend-points`);
      const data = res.ok ? await res.json() : null;
      if (legendFor === id) legend = (data?.points ?? []) as LegendPoint[];
    } catch {
      if (legendFor === id) legend = [];
    }
    legendLoading = false;
  }

  // `loadLegend` writes `legendFor`, which this statement reads, so it
  // re-enters once and then the guard is false — the guard is the termination
  // condition.
  $: if (tab === 'legend' && mapId && mapId !== legendFor) void loadLegend(mapId);

  $: legendRows = mapId && mapId === legendFor ? legend : [];

  $: published = map?.status === 'public' || map?.status === 'featured';

  $: infoRows = map
    ? ([
        ['Year', map.year_label ?? (map.year ? String(map.year) : '')],
        ['Creator', map.creator ?? ''],
        ['Collection', map.collection ?? map.holding_institution ?? ''],
        ['Type', map.map_type ?? ''],
        ['Place', map.location ?? ''],
      ].filter(([, v]) => !!v) as [string, string][])
    : [];
</script>

<aside class="panel" data-tour="controls">
  <div class="sb-bar">
    <span class="sb-bar-title">This sheet</span>
    <button
      type="button"
      class="sb-btn is-icon is-ghost"
      on:click={() => dispatch('toggleCollapse')}
      aria-label="Collapse panel"
      title="Hide panel"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <path d="M9 3h10a2 2 0 012 2v14a2 2 0 01-2 2H9" /><path d="M5 8l4 4-4 4" />
      </svg>
    </button>
  </div>

  <div class="rail-filters">
    <PlaceSearchBar on:pickLocation={(e) => dispatch('pickLocation', e.detail)} />
  </div>

  <div class="sb-pill-row tab-strip" role="tablist">
    {#each TABS as t (t.key)}
      <button
        type="button"
        class="sb-pill is-compact"
        class:is-on={tab === t.key}
        role="tab"
        aria-selected={tab === t.key}
        on:click={() => (tab = t.key)}>{t.label}</button
      >
    {/each}
  </div>

  <div class="card-wrap">
    <SidebarCard grow={1} flush={true} padded={tab !== 'control'}>
      {#if tab === 'info'}
        {#if !map}
          <p class="sb-empty">Add a map layer to see its details.</p>
        {:else}
          <h3 class="if-name">{map.name}</h3>
          <TopSheetActions
            {mapId}
            {published}
            {vectorsOn}
            on:toggleVectors={(e) => dispatch('toggleVectors', e.detail)}
          />
          <dl class="if-dl">
            {#each infoRows as [label, value] (label)}
              <dt>{label}</dt>
              <dd>{value}</dd>
            {/each}
          </dl>
          {#if map.dc_description}
            <p class="if-desc">{map.dc_description}</p>
          {/if}
          {#if map.source_url}
            <div class="if-links">
              <!-- No catalogue-page link here: that is TopSheetActions' Share,
                   a few rows up the same tab. -->
              <a class="sb-btn is-sm" href={map.source_url} target="_blank" rel="noopener">
                Holding library
              </a>
            </div>
          {/if}
        {/if}
      {:else if tab === 'legend'}
        {#if !mapId}
          <p class="sb-empty">Add a map layer to read its legend.</p>
        {:else if legendLoading}
          <p class="sb-empty">Reading the legend…</p>
        {:else if legendRows.length === 0}
          <p class="sb-empty">This sheet has no numbered legend.</p>
        {:else}
          <button
            type="button"
            class="sb-btn is-sm is-block"
            class:is-on={showLegendPoints}
            on:click={() => dispatch('toggleLegendPoints')}
            title="Show numbered legend references on the map"
          >
            {showLegendPoints ? 'Legend points on' : 'Show legend points'}
          </button>
          <ul class="lg-list">
            {#each legendRows as p (p.n)}
              <li>
                <button
                  type="button"
                  class="lg-row"
                  title={p.accuracy_m ? `Within about ${p.accuracy_m} m` : 'Fly to this place'}
                  on:click={() =>
                    dispatch('pickLocation', {
                      lat: p.lat,
                      lng: p.lng,
                      label: p.name ?? `№${p.n}`,
                    })}
                >
                  <span class="lg-n">{p.n}</span>
                  <span class="lg-name">
                    {p.name ?? '—'}{#if p.vn}<em> · {p.vn}</em>{/if}
                  </span>
                  {#if p.grid}<span class="lg-grid">{p.grid}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {:else}
        <!-- `showSearch={false}`: the rail's own search bar is at the top.
             `legendPointsAvailable={false}`: the Legend tab carries that
             toggle, beside the list it switches on. -->
        <LayerControlsPanel
          {viewMode}
          {gpsActive}
          showSearch={false}
          legendPointsAvailable={false}
          on:changeViewMode={(e) => dispatch('changeViewMode', e.detail)}
          on:pickLocation={(e) => dispatch('pickLocation', e.detail)}
          on:toggleGps={() => dispatch('toggleGps')}
        />
      {/if}
    </SidebarCard>
  </div>
</aside>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
    border-left: var(--border-thick);
    overflow: hidden;
    min-width: 0;
  }

  .rail-filters {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.45rem 0.6rem 0.5rem;
  }

  .tab-strip {
    padding: 0 0.45rem 0.35rem;
  }
  .card-wrap {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  /* Legend */
  .lg-list {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .lg-row {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    width: 100%;
    padding: 0.25rem 0.2rem;
    background: none;
    border: 0;
    border-top: var(--sb-border);
    text-align: left;
    font-size: 0.78rem;
    color: var(--sb-text);
    cursor: pointer;
  }
  .lg-row:hover {
    background: var(--sb-row-hover);
  }
  .lg-n {
    flex: 0 0 1.4rem;
    font-family: var(--sb-font-display);
    font-weight: 800;
    font-size: 0.72rem;
    color: var(--sb-text-meta);
  }
  .lg-name {
    flex: 1;
    min-width: 0;
  }
  .lg-name em {
    font-style: normal;
    color: var(--sb-text-meta);
  }
  .lg-grid {
    flex: 0 0 auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.68rem;
    color: var(--sb-text-meta);
  }

  /* Info */
  .if-name {
    margin: 0 0 0.5rem;
    font-family: var(--sb-font-display);
    font-size: 0.92rem;
    line-height: 1.25;
    color: var(--sb-text);
  }
  .if-dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.15rem 0.5rem;
    margin: 0;
    font-size: 0.78rem;
  }
  .if-dl dt {
    font-family: var(--sb-font-display);
    font-size: 0.62rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--sb-text-meta);
    align-self: baseline;
  }
  .if-dl dd {
    margin: 0;
    min-width: 0;
    color: var(--sb-text);
  }
  .if-desc {
    margin: 0.6rem 0 0;
    font-size: 0.76rem;
    line-height: 1.45;
    color: var(--sb-text-meta);
  }
  .if-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.7rem;
  }
</style>
