<!--
  DataTable.svelte — the scaffolding every `.data-table` in the app repeated.

  Four tables (/catalog, /admin?tab=scout, TraceSidebar, OcrSidebar) each wrote
  the same fifteen lines: a `.table-wrap`, the `<table>` and its density, a
  `<thead><tr>` looping `SortHeader` over a column list with plain `<th>`s hand
  written around it for the dot / thumbnail / actions columns, a `<tbody>`, and
  an empty-state paragraph after the table. Only the rows differed — and the
  rows are the whole point of each one, which is why they stay with their
  table and arrive here through the default slot.

  What that bought: the a11y (`scope`, the accessible name on a blank header,
  `aria-sort` via `SortHeader`) is written once, and a new table is a column
  array plus its `<tr>`s.

  Columns, not slots, describe the blank ones. `{ key: 'dot', label: '',
  klass: 'col-dot', srLabel: 'Type colour', sortable: false }` is the `<th>`
  each table used to hand-write beside its loop, so a table's header is one
  list read in one place — including the order.

    <DataTable {columns} klass="is-dense" bind:sort>
      {#each rows as row (row.id)}
        <tr>…</tr>
      {/each}
      <svelte:fragment slot="after">
        {#if !rows.length}<p class="table-empty">Nothing matches.</p>{/if}
      </svelte:fragment>
    </DataTable>

  Anything that is not a row — an empty state, a "show 500 more" button — goes
  in the `after` slot, which is inside the scroll container and after the
  `</table>`. It is a slot rather than an `empty` prop because the four tables
  disagree about what belongs there: two have two different empty messages, one
  has a paging button under a full table.

  Styling a cell from the calling component: the `<tr>`/`<td>` are the caller's
  own markup, so its scoped CSS reaches them. The `<table>`, `<thead>` and
  `<tbody>` are this component's, so a rule keyed on one of those needs either
  a `:global()` inside a wrapper the caller owns, or — better — a class on the
  cells themselves.
-->
<script context="module" lang="ts">
  export type TableColumn = {
    /** Sort key, and the `{#each}` key. Unique within the table. */
    key: string;
    label: string;
    /** Width, alignment (`num`), anything else the column needs. */
    klass?: string;
    /** Accessible name for a column whose header is deliberately blank. */
    srLabel?: string;
    /** Default true. A blank or actions column sets it false. */
    sortable?: boolean;
  };
</script>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import SortHeader from './SortHeader.svelte';
  import { toggleSort, type SortState } from '$lib/core/utils/tableSort';

  export let columns: TableColumn[] = [];
  /** Classes for the `<table>`: its density (`is-dense` / `is-card`) and the caller's own hook. */
  export let klass = '';
  /** Classes for the scroll container — `custom-scrollbar` on the sidebar tables. */
  export let wrapClass = '';
  /**
   * The table's sort, two-way. A click toggles it here and dispatches `sort`;
   * `null` leaves every header a plain label. A table sorted by the server
   * passes its own derived state and listens to the event instead of binding.
   */
  export let sort: SortState<string> | null = null;

  const dispatch = createEventDispatcher<{ sort: { key: string } }>();

  function onSort(e: CustomEvent<{ key: string }>) {
    if (sort) sort = toggleSort(sort, e.detail.key);
    dispatch('sort', e.detail);
  }
</script>

<div class="table-wrap {wrapClass}">
  <table class="data-table {klass}">
    <thead>
      <tr>
        {#each columns as col (col.key)}
          {#if sort && col.sortable !== false}
            <SortHeader
              label={col.label}
              key={col.key}
              {sort}
              klass={col.klass ?? ''}
              on:sort={onSort}
            />
          {:else}
            <th scope="col" class={col.klass ?? ''} aria-label={col.srLabel || undefined}
              >{col.label}</th
            >
          {/if}
        {/each}
      </tr>
    </thead>
    <tbody>
      <slot />
    </tbody>
  </table>
  <slot name="after" />
</div>
