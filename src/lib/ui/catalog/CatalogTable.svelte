<!--
  CatalogTable — sortable, groupable table for the unified catalog.
  Click a column header to sort (toggle direction). Use the "Group by" dropdown
  to collapse rows by Year / Area / Type / Source.

  `compact` delegates to CatalogTableCompact — a genuinely different layout
  (Year + Name rows for sidebars), not this table with columns hidden.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { MapListItem } from '$lib/maps/types';
  import { layersStore, toggleOverlayFor } from '$lib/stores/layersStore';
  import CatalogTableCompact from './CatalogTableCompact.svelte';
  import {
    sortRows,
    groupRows,
    nextSort,
    type SortKey,
    type GroupKey,
    type SortDir,
  } from './catalogTableModel';

  export let items: MapListItem[] = [];
  export let compact: boolean = false;
  export let activeId: string | null = null;
  /** Show the "+ overlay" toggle (only on the /explore sidebar). */
  export let showLayerActions: boolean = false;

  const dispatch = createEventDispatcher();

  $: overlayMapIds = new Set($layersStore.overlays.map((o) => o.ref.mapId));

  let sortKey: SortKey = 'year';
  let sortDir: SortDir = 'asc';
  let groupBy: GroupKey = 'none';

  function setSort(k: SortKey) {
    ({ key: sortKey, dir: sortDir } = nextSort({ key: sortKey, dir: sortDir }, k));
  }

  $: sorted = sortRows(items, sortKey, sortDir);
  $: groups = groupRows(sorted, groupBy);

  let collapsed = new Set<string>();
  function toggleGroup(label: string | null) {
    if (label == null) return;
    if (collapsed.has(label)) collapsed.delete(label);
    else collapsed.add(label);
    collapsed = new Set(collapsed);
  }

  function openItem(item: MapListItem) {
    dispatch('open', item);
  }
  function chip(group: string, value: string | null | undefined) {
    if (!value) return;
    dispatch('facet', { group, value: String(value) });
  }
</script>

{#if compact}
  <CatalogTableCompact items={sorted} {activeId} {showLayerActions} on:open />
{:else}
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

  <table class="ct">
    <thead>
      <tr>
        <th class="thumb-col"></th>
        <th class="sortable" on:click={() => setSort('name')}
          >Title<span class="sort-ind"
            ><span class:on={sortKey === 'name' && sortDir === 'asc'}>▲</span><span
              class:on={sortKey === 'name' && sortDir === 'desc'}>▼</span
            ></span
          ></th
        >
        <th class="sortable num" on:click={() => setSort('year')}
          >Year<span class="sort-ind"
            ><span class:on={sortKey === 'year' && sortDir === 'asc'}>▲</span><span
              class:on={sortKey === 'year' && sortDir === 'desc'}>▼</span
            ></span
          ></th
        >
        <th class="sortable" on:click={() => setSort('location')}
          >Area<span class="sort-ind"
            ><span class:on={sortKey === 'location' && sortDir === 'asc'}>▲</span><span
              class:on={sortKey === 'location' && sortDir === 'desc'}>▼</span
            ></span
          ></th
        >
        <th class="sortable" on:click={() => setSort('map_type')}
          >Type<span class="sort-ind"
            ><span class:on={sortKey === 'map_type' && sortDir === 'asc'}>▲</span><span
              class:on={sortKey === 'map_type' && sortDir === 'desc'}>▼</span
            ></span
          ></th
        >
        <th class="sortable" on:click={() => setSort('collection')}
          >Collection<span class="sort-ind"
            ><span class:on={sortKey === 'collection' && sortDir === 'asc'}>▲</span><span
              class:on={sortKey === 'collection' && sortDir === 'desc'}>▼</span
            ></span
          ></th
        >
        <th class="sortable status-col" on:click={() => setSort('status')}
          >Status<span class="sort-ind"
            ><span class:on={sortKey === 'status' && sortDir === 'asc'}>▲</span><span
              class:on={sortKey === 'status' && sortDir === 'desc'}>▼</span
            ></span
          ></th
        >
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
            {@const isScout = (item as any)._table === 'scout'}
            {@const isOverlay = overlayMapIds.has(item.id)}
            <tr
              class:scout-row={isScout}
              class:active-row={item.id === activeId}
              on:click={() => openItem(item)}
            >
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
                  {#if showLayerActions && !isScout && (item as any).georef_done}
                    <button
                      type="button"
                      class="cmp-btn"
                      class:on={isOverlay}
                      on:click|stopPropagation={() => toggleOverlayFor(item)}
                      title={isOverlay ? 'Remove overlay' : 'Add as overlay'}
                      aria-label={isOverlay ? 'Remove overlay' : 'Add as overlay'}
                      >{isOverlay ? '✓' : '+'}</button
                    >
                  {/if}
                </div>
                {#if (item as any).creator}<div class="sub">{(item as any).creator}</div>{/if}
              </td>
              <td class="num">
                {#if item.year}
                  <button
                    class="tag-chip"
                    on:click|stopPropagation={() => chip('year', String(item.year))}
                    >{item.year}</button
                  >
                {:else}—{/if}
              </td>
              <td>
                {#if item.location}
                  <button
                    class="tag-chip"
                    on:click|stopPropagation={() => chip('area', item.location)}
                    >{item.location}</button
                  >
                {:else}—{/if}
              </td>
              <td>
                {#if item.map_type}
                  <button
                    class="tag-chip"
                    on:click|stopPropagation={() => chip('type', item.map_type)}
                    >{item.map_type}</button
                  >
                {:else}—{/if}
              </td>
              <td title={item.collection || ''} class="collection-col">{item.collection || '—'}</td>
              <td class="status-col">
                {#if isScout}
                  <span class="badge scout">scout</span>
                {:else if (item as any).georef_done}
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
{/if}

<style>
  .ct-toolbar {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding: var(--space-1) 0 var(--space-2);
    font-family: var(--font-family-base);
    font-size: 0.85rem;
  }
  .group-pick {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: var(--font-semibold);
  }
  .group-pick select {
    font: inherit;
    padding: 0.2rem 0.4rem;
    border: 1.5px solid var(--color-border);
    border-radius: var(--sb-radius-sm);
    background: var(--color-white);
  }
  .ct {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    background: var(--color-white);
    border: var(--border-thin);
    border-radius: 10px;
    box-shadow: 3px 3px 0 var(--color-border);
    font-family: var(--font-family-base);
    font-size: 0.95rem;
    overflow: hidden;
  }
  .ct thead th {
    text-align: left;
    padding: 0.85rem 0.8rem;
    background: var(--sb-head-bg);
    border-bottom: var(--border-thin);
    font-family: var(--font-family-display);
    font-weight: var(--font-extrabold);
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .ct .sortable {
    cursor: pointer;
    user-select: none;
  }
  .ct .sortable:hover {
    background: var(--sb-head-hover);
  }
  .sort-ind {
    display: inline-flex;
    flex-direction: column;
    margin-left: 0.35rem;
    line-height: 0.75;
    font-size: 0.55rem;
    vertical-align: middle;
  }
  .sort-ind span {
    color: var(--sb-sort-idle);
  }
  .sort-ind span.on {
    color: var(--color-text);
  }
  .ct tbody td {
    padding: 0.9rem 0.8rem;
    border-bottom: 1px dashed var(--color-gray-300);
    vertical-align: middle;
  }
  .ct tbody tr:last-child td {
    border-bottom: none;
  }
  .ct tbody tr {
    cursor: pointer;
  }
  .ct tbody tr:hover td {
    background: var(--sb-row-hover);
  }
  .ct .title-link {
    font-weight: var(--font-bold);
    color: var(--color-text);
    font-size: 1rem;
  }
  .ct tbody tr:hover .title-link {
    text-decoration: underline;
  }
  .tag-chip {
    background: transparent;
    border: 1.5px solid transparent;
    padding: 0.15rem var(--space-2);
    border-radius: var(--radius-pill);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    color: var(--color-text);
  }
  .tag-chip:hover {
    background: var(--color-white);
    border-color: var(--color-border);
    box-shadow: 1.5px 1.5px 0 var(--color-border);
  }
  .collection-col {
    color: var(--sb-text-meta);
    font-size: 0.85rem;
  }
  .ct .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .ct .thumb-col {
    width: 96px;
    padding: var(--space-2) 0.6rem;
  }
  .ct .thumb-col img,
  .ct .thumb-col .thumb-empty {
    width: 84px;
    height: 64px;
    object-fit: cover;
    border: 1.5px solid var(--color-border);
    border-radius: var(--sb-radius-sm);
    background: var(--sb-thumb-bg);
    display: block;
  }
  .ct .title-col .sub {
    font-size: 0.8rem;
    color: var(--sb-text-soft);
    margin-top: 0.2rem;
  }
  .ct .status-col {
    width: 90px;
    text-align: right;
    white-space: nowrap;
  }
  .badge {
    display: inline-block;
    padding: 0.05rem 0.4rem;
    font-size: 0.7rem;
    font-weight: var(--font-bold);
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border);
    margin-left: 0.2rem;
  }
  .badge.scout {
    background: var(--sb-accent-yellow);
  }
  .badge.status-map {
    background: var(--sb-badge-map);
  }
  .badge.status-img {
    background: var(--sb-thumb-bg);
  }
  .group-row {
    cursor: pointer;
    background: var(--sb-group-bg);
  }
  .group-row td {
    padding: var(--space-2) var(--space-3);
    border-top: 1.5px solid var(--color-border);
    border-bottom: 1.5px solid var(--color-border);
  }
  .group-row:hover {
    background: var(--sb-group-bg-hover);
  }
  .caret {
    display: inline-block;
    width: 1em;
  }
  .group-count {
    margin-left: var(--space-2);
    padding: 0.05rem 0.45rem;
    background: var(--color-text);
    color: var(--color-white);
    border-radius: var(--radius-pill);
    font-size: 0.72rem;
    font-weight: var(--font-extrabold);
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .cmp-btn {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--color-white);
    color: var(--color-text);
    border: 1.5px solid var(--color-border);
    border-radius: var(--radius-pill);
    font: inherit;
    font-family: var(--font-family-base);
    font-size: 0.9rem;
    font-weight: var(--font-extrabold);
    line-height: 1;
    cursor: pointer;
    padding: 0;
  }
  .cmp-btn:hover {
    background: var(--sb-accent-yellow);
  }
  .cmp-btn.on {
    background: var(--color-text);
    color: var(--color-white);
    font-size: 0.75rem;
  }

  .scout-row td {
    background: var(--sb-scout-bg);
  }
  .active-row td {
    background: var(--sb-accent-yellow);
    box-shadow: inset 3px 0 0 var(--color-border);
  }
  .active-row:hover td {
    background: var(--sb-accent-yellow-strong);
  }
  .active-row .title-link {
    text-decoration: underline;
  }
  @media (max-width: 800px) {
    .ct th:nth-child(5),
    .ct td:nth-child(5) {
      display: none;
    }
    .ct th:nth-child(6),
    .ct td:nth-child(6) {
      display: none;
    }
  }
</style>
