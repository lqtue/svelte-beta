/**
 * tableSort.ts — the sort half of the shared sidebar tables
 * (OcrSidebar, TraceSidebar). Pure helpers, no state of their own:
 * the component keeps `sortKey` / `sortAsc` so they stay reactive.
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

/** Arrow suffix for a header cell — empty when the column is not the sort key. */
export function sortIcon<K extends string>(state: SortState<K>, key: K): string {
  return state.key !== key ? '' : state.asc ? ' ↑' : ' ↓';
}

/** Sorts a copy of `list` by the value `pick` returns (numbers or strings). */
export function applySort<T, K extends string>(
  list: T[],
  state: SortState<K>,
  pick: (item: T, key: K) => string | number
): T[] {
  return [...list].sort((a, b) => {
    const va = pick(a, state.key);
    const vb = pick(b, state.key);
    const cmp =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb));
    return state.asc ? cmp : -cmp;
  });
}
