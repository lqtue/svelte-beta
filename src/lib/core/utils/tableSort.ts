/**
 * tableSort.ts — the sort half of every `.data-table` in the app.
 *
 * Pure helpers, no state of their own: the component keeps the `SortState` so
 * it stays reactive, and hands it back with the key that was clicked.
 *
 * It lives in `core` because all four sortable tables are in different
 * features — /catalog, /admin?tab=scout, and the two contribute sidebars — and
 * a feature may not import another feature. It was `contribute/shared/` until
 * Sept 2026, which is why /catalog carried a second copy (`nextSort`,
 * `sortRows` and a `SortDir` of `'asc' | 'desc'` where this one has a boolean).
 *
 * Pair it with `$lib/ui/SortHeader.svelte`, which is the `<th>` that drives it.
 */

export type SortState<K extends string> = { key: K; asc: boolean };

/** Click a header: same key flips direction, a new key adopts `defaultAsc`. */
export function toggleSort<K extends string>(
  state: SortState<K>,
  key: K,
  defaultAsc: (key: K) => boolean = () => true
): SortState<K> {
  return state.key === key ? { key, asc: !state.asc } : { key, asc: defaultAsc(key) };
}

/**
 * One collator for the whole app rather than a `localeCompare` per comparison.
 *
 * `numeric` is the reason it is worth naming: without it "Rue 100" sorts
 * between "Rue 10" and "Rue 11", and a street index is mostly numbered
 * streets. Building the collator once and reusing it is also roughly an order
 * of magnitude faster than `String#localeCompare`, which rebuilds one per call
 * — and this runs n log n times on every keystroke in a 2000-row sidebar.
 */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'variant' });

type Cell = string | number | null | undefined;

/**
 * Blanks sort last, and **the direction does not move them** — which is why
 * this is ranked outside the comparison rather than folded into it.
 *
 * A blank cell is not the smallest value, it is the absence of one, and a
 * reviewer sorting by a column is looking for what is *in* it; flipping the
 * column to find the other end should not hand them a screenful of empties.
 * The contribute tables used to stringify a missing value instead, so a row
 * with no category sorted under "undefined" — between the real categories
 * beginning with `t` and `v`.
 */
const blank = (v: Cell) => (v == null || v === '' ? 1 : 0);

function compare(a: Cell, b: Cell) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * Sorts a copy of `list` by the value `pick` returns.
 *
 * `pick` is called **once per row**, not once per comparison. That is the
 * whole reason this is decorate-sort-undecorate rather than a comparator:
 * `OcrSidebar`'s `pick` parses a row's printed line with a regex, and a plain
 * comparator ran it ~22,000 times for 2000 rows, on every keystroke. Ties keep
 * their input order — `Array#sort` is stable — so a second sort refines the
 * first instead of shuffling it.
 */
export function applySort<T, K extends string>(
  list: T[],
  state: SortState<K>,
  pick: (item: T, key: K) => Cell
): T[] {
  const dir = state.asc ? 1 : -1;
  return list
    .map((item, i) => {
      const v = pick(item, state.key);
      return { item, i, v, blank: blank(v) };
    })
    .sort((a, b) => a.blank - b.blank || (a.blank ? 0 : compare(a.v, b.v) * dir) || a.i - b.i)
    .map((d) => d.item);
}
