<!--
  SortHeader.svelte — a sortable column header for any `.data-table`.

  There were four of these, hand-rolled, one per table: /catalog wrote five
  lines of caret markup per column (six columns, thirty-six lines), the scout
  queue and the two contribute sidebars each concatenated a text arrow into the
  header string. None of the four was reachable from a keyboard and none said
  anything to a screen reader — a `<th>` with `on:click` is not a control, it is
  a label someone attached a handler to.

  So the header is a real `<button>` inside the `<th>`: Tab reaches it, Enter
  and Space work, focus is visible, and `aria-sort` on the `<th>` is what tells
  a screen reader which column the table is ordered by and which way. The button
  is full-bleed and inherits the header's own type (`.th-sort` in table.css), so
  it looks exactly like the `<th>` it replaced.

  The indicator is the two-caret `.sort-ind` /catalog already had, now the one
  everywhere: both carets are always drawn and one lights up, so the header
  does not change width when the direction flips — a text arrow appearing on
  click nudged every column to its right.

  Pairs with `$lib/core/utils/tableSort.ts`.

  Usage:
    <SortHeader label="Text" key="text" {sort} on:sort={(e) => pick(e.detail.key)} />
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  /** The column's own key, echoed back on click. */
  export let key: string;
  export let label: string;
  /** The table's current sort. `asc` is only read when `sort.key === key`. */
  export let sort: { key: string; asc: boolean };
  /** Extra classes for the `<th>` — column width, `num`, and so on. */
  export let klass = '';

  const dispatch = createEventDispatcher<{ sort: { key: string } }>();

  $: active = sort.key === key;
  $: ariaSort = (active ? (sort.asc ? 'ascending' : 'descending') : 'none') as
    'ascending' | 'descending' | 'none';
</script>

<th scope="col" class="sortable {klass}" aria-sort={ariaSort}>
  <button type="button" class="th-sort" on:click={() => dispatch('sort', { key })}>
    {label}<span class="sort-ind" aria-hidden="true"
      ><span class:on={active && sort.asc}>▲</span><span class:on={active && !sort.asc}>▼</span
      ></span
    >
  </button>
</th>
