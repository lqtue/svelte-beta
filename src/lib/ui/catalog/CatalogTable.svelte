<!--
  CatalogTable — sortable, groupable table for the unified catalog.
  Click a column header to sort (toggle direction). Use the "Group by" dropdown
  to collapse rows by Year / Area / Type / Source.
-->
<script lang="ts">
  import type { MapListItem } from '$lib/maps/types';
  import { createEventDispatcher } from 'svelte';

  export let items: MapListItem[] = [];
  export let compact: boolean = false;
  export let activeId: string | null = null;
  /** Show the "+ overlay" toggle (only on /view sidebar). */
  export let showLayerActions: boolean = false;

  import { layersStore, MAX_OVERLAY_LAYERS, type HistoricalRef } from '$lib/stores/layersStore';
  $: layersState = $layersStore;
  $: overlayMapIds = new Set(layersState.overlays.map((o) => o.ref.mapId));

  function toHistoricalRef(item: any): HistoricalRef | null {
    const allmapsId = item.annotation_url ?? item.allmaps_id;
    if (!item?.id || !allmapsId) return null;
    return { kind: 'historical', mapId: item.id, allmapsId, name: item.name, thumbnail: item.thumbnail };
  }

  function toggleOverlay(item: any) {
    const ref = toHistoricalRef(item);
    if (!ref) return;
    if (overlayMapIds.has(ref.mapId)) layersStore.removeOverlayByMapId(ref.mapId);
    else if (layersState.overlays.length < MAX_OVERLAY_LAYERS) layersStore.addOverlay(ref);
  }

  const dispatch = createEventDispatcher();

  type SortKey = 'name' | 'year' | 'location' | 'map_type' | 'collection' | 'status';
  type GroupKey = 'none' | 'year' | 'location' | 'map_type' | 'collection' | 'status';

  let sortKey: SortKey = 'year';
  let sortDir: 'asc' | 'desc' = 'asc';
  let groupBy: GroupKey = 'none';

  function shortCollection(c: string | undefined | null): string {
    if (!c) return '—';
    if (c.includes('BnF') || c.includes('Bibliothèque nationale')) return 'BnF';
    if (c.includes('Humazur')) return 'Humazur';
    if (c.includes('UT Austin')) return 'UT Austin';
    if (c.includes('Internet Archive')) return 'IA';
    if (c.includes('Library of Congress')) return 'LOC';
    if (c.includes('David Rumsey')) return 'Rumsey';
    if (c.includes('Cartomundi')) return 'Cartomundi';
    return c.split(',')[0].trim();
  }

  function setSort(k: SortKey) {
    if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = k; sortDir = 'asc'; }
  }

  function cmp(a: any, b: any): number {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  }

  function statusOf(item: any): string {
    if (item._table === 'scout') return 'Scout';
    return item.georef_done ? 'Map' : 'Image';
  }

  function keyOf(item: any, k: SortKey | GroupKey): any {
    if (k === 'name') return item.name;
    if (k === 'year') return item.year;
    if (k === 'location') return item.location;
    if (k === 'map_type') return item.map_type;
    if (k === 'collection') return item.collection;
    if (k === 'status') return statusOf(item);
    return null;
  }

  $: sorted = [...items].sort((a, b) => {
    const r = cmp(keyOf(a, sortKey), keyOf(b, sortKey));
    return sortDir === 'asc' ? r : -r;
  });

  $: groups = (() => {
    if (groupBy === 'none') return [{ label: null, rows: sorted }] as { label: string | null; rows: any[] }[];
    const m = new Map<string, any[]>();
    for (const r of sorted) {
      const v = keyOf(r, groupBy);
      const key = v == null || v === '' ? '—' : String(v);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return [...m.entries()].map(([label, rows]) => ({ label, rows }));
  })();

  let collapsed = new Set<string>();
  function toggleGroup(label: string | null) {
    if (label == null) return;
    if (collapsed.has(label)) collapsed.delete(label);
    else collapsed.add(label);
    collapsed = new Set(collapsed);
  }

  function arrowState(k: SortKey): { up: boolean; down: boolean } {
    if (sortKey !== k) return { up: false, down: false };
    return { up: sortDir === 'asc', down: sortDir === 'desc' };
  }

  function openItem(item: any) { dispatch('open', item); }
  function chip(group: string, value: string | null | undefined) {
    if (!value) return;
    dispatch('facet', { group, value: String(value) });
  }
</script>

{#if !compact}
<div class="ct-toolbar">
  <label class="group-pick">
    Group by
    <select bind:value={groupBy}>
      <option value="none">None</option>
      <option value="year">Year</option>
      <option value="location">Area</option>
      <option value="map_type">Type</option>
      <option value="collection">Collection</option>
      <option value="status">Status</option>
    </select>
  </label>
</div>
{/if}

<table class="ct" class:compact>
  <thead>
    <tr>
      <th class="thumb-col"></th>
      <th class="sortable" on:click={() => setSort('name')}>Title<span class="sort-ind"><span class:on={sortKey==='name'&&sortDir==='asc'}>▲</span><span class:on={sortKey==='name'&&sortDir==='desc'}>▼</span></span></th>
      <th class="sortable num" on:click={() => setSort('year')}>Year<span class="sort-ind"><span class:on={sortKey==='year'&&sortDir==='asc'}>▲</span><span class:on={sortKey==='year'&&sortDir==='desc'}>▼</span></span></th>
      <th class="sortable" on:click={() => setSort('location')}>Area<span class="sort-ind"><span class:on={sortKey==='location'&&sortDir==='asc'}>▲</span><span class:on={sortKey==='location'&&sortDir==='desc'}>▼</span></span></th>
      <th class="sortable" on:click={() => setSort('map_type')}>Type<span class="sort-ind"><span class:on={sortKey==='map_type'&&sortDir==='asc'}>▲</span><span class:on={sortKey==='map_type'&&sortDir==='desc'}>▼</span></span></th>
      <th class="sortable" on:click={() => setSort('collection')}>Collection<span class="sort-ind"><span class:on={sortKey==='collection'&&sortDir==='asc'}>▲</span><span class:on={sortKey==='collection'&&sortDir==='desc'}>▼</span></span></th>
      <th class="sortable status-col" on:click={() => setSort('status')}>Status<span class="sort-ind"><span class:on={sortKey==='status'&&sortDir==='asc'}>▲</span><span class:on={sortKey==='status'&&sortDir==='desc'}>▼</span></span></th>
    </tr>
  </thead>
  <tbody>
    {#each groups as g}
      {#if g.label !== null}
        <tr class="group-row" on:click={() => toggleGroup(g.label)}>
          <td colspan="7">
            <span class="caret">{collapsed.has(g.label) ? '▸' : '▾'}</span>
            <strong>{g.label}</strong>
            <span class="group-count">{g.rows.length}</span>
          </td>
        </tr>
      {/if}
      {#if g.label === null || !collapsed.has(g.label)}
        {#each g.rows as item (item.id)}
          {@const isScout = item._table === 'scout'}
          <tr class:scout-row={isScout} class:active-row={item.id === activeId} on:click={() => openItem(item)}>
            <td class="thumb-col">
              {#if item.thumbnail}
                <img src={item.thumbnail} alt="" loading="lazy" />
              {:else}
                <div class="thumb-empty"></div>
              {/if}
            </td>
            <td class="title-col">
              <div class="title-row">
                <span class="title-link">{item.name || '—'}</span>
                {#if showLayerActions && !isScout && item.georef_done}
                  {@const isOverlay = overlayMapIds.has(item.id)}
                  <button
                    type="button"
                    class="cmp-btn"
                    class:on={isOverlay}
                    on:click|stopPropagation={() => toggleOverlay(item)}
                    title={isOverlay ? 'Remove overlay' : 'Add as overlay'}
                    aria-label={isOverlay ? 'Remove overlay' : 'Add as overlay'}
                  >{isOverlay ? '✓' : '+'}</button>
                {/if}
              </div>
              {#if item.creator}<div class="sub">{item.creator}</div>{/if}
            </td>
            <td class="num">
              {#if item.year}
                <button class="tag-chip" on:click|stopPropagation={() => chip('year', String(item.year))}>{item.year}</button>
              {:else}—{/if}
            </td>
            <td>
              {#if item.location}
                <button class="tag-chip" on:click|stopPropagation={() => chip('area', item.location)}>{item.location}</button>
              {:else}—{/if}
            </td>
            <td>
              {#if item.map_type}
                <button class="tag-chip" on:click|stopPropagation={() => chip('type', item.map_type)}>{item.map_type}</button>
              {:else}—{/if}
            </td>
            <td title={item.collection || ''} class="collection-col">{item.collection || '—'}</td>
            <td class="status-col">
              {#if isScout}
                <span class="badge scout">scout</span>
              {:else if item.georef_done}
                <span class="badge status-map" title="Available on map">🌍 Map</span>
              {:else}
                <span class="badge status-img" title="Static image only">🖼️ Image</span>
              {/if}
            </td>
          </tr>
        {/each}
      {/if}
    {/each}
  </tbody>
</table>

<style>
  .ct-toolbar {
    display: flex; justify-content: flex-end; gap: 0.75rem;
    padding: 0.25rem 0 0.5rem;
    font-family: 'Outfit', sans-serif; font-size: 0.85rem;
  }
  .group-pick {
    display: inline-flex; align-items: center; gap: 0.4rem;
    font-weight: 600;
  }
  .group-pick select {
    font: inherit;
    padding: 0.2rem 0.4rem;
    border: 1.5px solid #111; border-radius: 6px;
    background: #fff;
  }
  .ct {
    width: 100%;
    border-collapse: separate; border-spacing: 0;
    background: #fff;
    border: 2px solid #111; border-radius: 10px;
    box-shadow: 3px 3px 0 #111;
    font-family: 'Outfit', sans-serif; font-size: 0.95rem;
    overflow: hidden;
  }
  .ct thead th {
    text-align: left;
    padding: 0.85rem 0.8rem;
    background: #fafaf7;
    border-bottom: 2px solid #111;
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 800; font-size: 0.82rem;
    text-transform: uppercase; letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .ct .sortable { cursor: pointer; user-select: none; }
  .ct .sortable:hover { background: #f0efe7; }
  .sort-ind {
    display: inline-flex; flex-direction: column;
    margin-left: 0.35rem;
    line-height: 0.75;
    font-size: 0.55rem;
    vertical-align: middle;
  }
  .sort-ind span { color: #c8c4b5; }
  .sort-ind span.on { color: #111; }
  .ct tbody td {
    padding: 0.9rem 0.8rem;
    border-bottom: 1px dashed #ddd;
    vertical-align: middle;
  }
  .ct tbody tr:last-child td { border-bottom: none; }
  .ct tbody tr { cursor: pointer; }
  .ct tbody tr:hover td { background: #fdfbf3; }
  .ct .title-link {
    font-weight: 700; color: #111;
    font-size: 1rem;
  }
  .ct tbody tr:hover .title-link { text-decoration: underline; }
  .tag-chip {
    background: transparent;
    border: 1.5px solid transparent;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font: inherit; font-size: 0.85rem;
    cursor: pointer;
    color: #111;
  }
  .tag-chip:hover { background: #fff; border-color: #111; box-shadow: 1.5px 1.5px 0 #111; }
  .collection-col { color: #555; font-size: 0.85rem; }
  .ct .num { text-align: right; font-variant-numeric: tabular-nums; }
  .ct .thumb-col { width: 96px; padding: 0.5rem 0.6rem; }
  .ct .thumb-col img,
  .ct .thumb-col .thumb-empty {
    width: 84px; height: 64px;
    object-fit: cover;
    border: 1.5px solid #111; border-radius: 6px;
    background: #f1ede0;
    display: block;
  }
  .ct .title-col a {
    font-weight: 700; color: #111; text-decoration: none;
    font-size: 1rem;
  }
  .ct .title-col a:hover { text-decoration: underline; }
  .ct .title-col .sub { font-size: 0.8rem; color: #666; margin-top: 0.2rem; }
  .ct .status-col { width: 90px; text-align: right; white-space: nowrap; }
  .badge {
    display: inline-block; padding: 0.05rem 0.4rem;
    font-size: 0.7rem; font-weight: 700;
    border-radius: 999px; border: 1px solid #111;
    margin-left: 0.2rem;
  }
  .badge.scout { background: #fff7d1; }
  .badge.status-map { background: #d4f5e9; }
  .badge.status-img { background: #f1ede0; }
  .group-row { cursor: pointer; background: #f6f4ec; }
  .group-row td { padding: 0.5rem 0.75rem; border-top: 1.5px solid #111; border-bottom: 1.5px solid #111; }
  .group-row:hover { background: #efece1; }
  .caret { display: inline-block; width: 1em; }
  .group-count {
    margin-left: 0.5rem;
    padding: 0.05rem 0.45rem;
    background: #111; color: #fff;
    border-radius: 999px;
    font-size: 0.72rem; font-weight: 800;
  }
  .title-row { display: flex; align-items: center; gap: 0.4rem; }
  .cmp-btn {
    flex-shrink: 0;
    width: 22px; height: 22px;
    display: inline-flex; align-items: center; justify-content: center;
    background: #fff; color: #111;
    border: 1.5px solid #111; border-radius: 999px;
    font: inherit; font-family: 'Outfit', sans-serif;
    font-size: 0.9rem; font-weight: 800; line-height: 1;
    cursor: pointer; padding: 0;
  }
  .cmp-btn:hover { background: #fff7d1; }
  .cmp-btn.on { background: #111; color: #fff; font-size: 0.75rem; }

  .scout-row td { background: #fffbe9; }
  .active-row td { background: #fff7d1; box-shadow: inset 3px 0 0 #111; }
  .active-row:hover td { background: #fff3b8; }
  .active-row .title-link { text-decoration: underline; }
  @media (max-width: 800px) {
    .ct .map_type-col, .ct th:nth-child(5), .ct td:nth-child(5) { display: none; }
    .ct th:nth-child(6), .ct td:nth-child(6) { display: none; }
  }

  /* Compact: shown inside sidebars. Keep thumb + title + year + status only. */
  .ct.compact { box-shadow: none; border-width: 1.5px; border-radius: 6px; font-size: 0.85rem; }
  .ct.compact thead th { padding: 0.5rem 0.45rem; font-size: 0.7rem; }
  .ct.compact tbody td { padding: 0.5rem 0.45rem; }
  .ct.compact .thumb-col { width: 56px; padding: 0.35rem 0.4rem; }
  .ct.compact .thumb-col img,
  .ct.compact .thumb-col .thumb-empty { width: 48px; height: 38px; border-radius: 4px; }
  .ct.compact .title-link { font-size: 0.85rem; }
  .ct.compact .title-col .sub { font-size: 0.7rem; }
  /* Hide Type (5), Collection (6), Status (7). Keep thumb, title, Year (3), Area (4). */
  .ct.compact th:nth-child(5), .ct.compact td:nth-child(5),
  .ct.compact th:nth-child(6), .ct.compact td:nth-child(6),
  .ct.compact th:nth-child(7), .ct.compact td:nth-child(7) { display: none; }
  .ct.compact .tag-chip { font-size: 0.72rem; padding: 0.1rem 0.4rem; }
</style>
