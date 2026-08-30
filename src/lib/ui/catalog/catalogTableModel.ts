/**
 * catalogTableModel.ts — sort / group / label logic shared by CatalogTable
 * (full) and CatalogTableCompact (year + name rows).
 */
import { statusOf } from '$lib/catalog/catalogSearch';

export type SortKey = 'name' | 'year' | 'location' | 'map_type' | 'collection' | 'status';
export type GroupKey = 'none' | SortKey;
export type SortDir = 'asc' | 'desc';

export interface TableGroup<T> {
  label: string | null;
  rows: T[];
}

/** Display casing for the shared status rule; sort/group keys read this. */
const STATUS_LABEL = { scout: 'Scout', map: 'Map', image: 'Image' } as const;

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export function keyOf(item: any, k: SortKey | GroupKey): any {
  if (k === 'name') return item.name;
  if (k === 'year') return item.year;
  if (k === 'location') return item.location;
  if (k === 'map_type') return item.map_type;
  if (k === 'collection') return item.collection;
  if (k === 'status') return STATUS_LABEL[statusOf(item)];
  return null;
}

export function sortRows<T>(items: T[], sortKey: SortKey, sortDir: SortDir): T[] {
  return [...items].sort((a, b) => {
    const r = cmp(keyOf(a, sortKey), keyOf(b, sortKey));
    return sortDir === 'asc' ? r : -r;
  });
}

export function groupRows<T>(sorted: T[], groupBy: GroupKey): TableGroup<T>[] {
  if (groupBy === 'none') return [{ label: null, rows: sorted }];
  const m = new Map<string, T[]>();
  for (const r of sorted) {
    const v = keyOf(r, groupBy);
    const key = v == null || v === '' ? '—' : String(v);
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(r);
  }
  return [...m.entries()].map(([label, rows]) => ({ label, rows }));
}

/** Next sort state for a header click — same key toggles direction. */
export function nextSort(
  current: { key: SortKey; dir: SortDir },
  clicked: SortKey
): { key: SortKey; dir: SortDir } {
  if (current.key === clicked) {
    return { key: clicked, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { key: clicked, dir: 'asc' };
}
