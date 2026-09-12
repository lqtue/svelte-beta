import { test, expect } from '@playwright/test';
import { toggleSort, applySort, type SortState } from '../src/lib/core/utils/tableSort';

/**
 * The sort behind every `.data-table`. Four tables used to carry their own,
 * which is why this pins the three things that differed between them rather
 * than the fact that sorting sorts.
 */

type Row = { id: string; name: string | null; year: number | null };
const rows = (...r: Row[]) => r;
const names = (r: Row[]) => r.map((x) => x.name);
const ids = (r: Row[]) => r.map((x) => x.id);

const ASC: SortState<'name' | 'year'> = { key: 'name', asc: true };

test('a blank cell sorts last whichever way the column points', () => {
  // A blank is the absence of a value, not the smallest one, and a reviewer
  // sorting by a column is looking for what is *in* it. The contribute tables
  // stringified a missing value, so an uncategorised row filed under
  // "undefined" — between the real values starting with `t` and `v`.
  const list = rows(
    { id: 'a', name: 'Zola', year: 1 },
    { id: 'b', name: null, year: null },
    { id: 'c', name: '', year: 2 },
    { id: 'd', name: 'Alpha', year: 3 }
  );
  expect(names(applySort(list, ASC, (r, k) => r[k]))).toEqual(['Alpha', 'Zola', null, '']);
  expect(names(applySort(list, { key: 'name', asc: false }, (r, k) => r[k]))).toEqual([
    'Zola',
    'Alpha',
    null,
    '',
  ]);
});

test('numbers inside a string sort as numbers', () => {
  // A street index is mostly numbered streets. Without `numeric` collation
  // "Rue 100" sits between "Rue 10" and "Rue 11".
  const list = rows(
    { id: 'a', name: 'Rue 100', year: null },
    { id: 'b', name: 'Rue 11', year: null },
    { id: 'c', name: 'Rue 10', year: null },
    { id: 'd', name: 'Rue 2', year: null }
  );
  expect(names(applySort(list, ASC, (r, k) => r[k]))).toEqual([
    'Rue 2',
    'Rue 10',
    'Rue 11',
    'Rue 100',
  ]);
});

test('numeric columns compare as numbers, not as text', () => {
  const list = rows(
    { id: 'a', name: 'a', year: 1900 },
    { id: 'b', name: 'b', year: 890 },
    { id: 'c', name: 'c', year: 1882 }
  );
  const sorted = applySort(list, { key: 'year', asc: true }, (r, k) => r[k]);
  expect(sorted.map((r) => r.year)).toEqual([890, 1882, 1900]);
});

test('the value function runs once per row, not once per comparison', () => {
  // This is the whole reason it is decorate-sort-undecorate. OcrSidebar's
  // `pick` parses a row's printed line with a regex; as a plain comparator it
  // ran ~22,000 times for 2000 rows, on every keystroke in the filter box.
  const list = Array.from({ length: 64 }, (_, i) => ({
    id: String(i),
    name: `n${(i * 37) % 64}`,
    year: i,
  }));
  let calls = 0;
  applySort(list, ASC, (r, k) => {
    calls++;
    return r[k];
  });
  expect(calls).toBe(list.length);
});

test('ties keep their input order, so a second sort refines the first', () => {
  const list = rows(
    { id: 'a', name: 'same', year: 3 },
    { id: 'b', name: 'same', year: 1 },
    { id: 'c', name: 'same', year: 2 }
  );
  expect(ids(applySort(list, ASC, (r, k) => r[k]))).toEqual(['a', 'b', 'c']);
  expect(ids(applySort(list, { key: 'name', asc: false }, (r, k) => r[k]))).toEqual([
    'a',
    'b',
    'c',
  ]);
});

test('the input array is not reordered under the caller', () => {
  const list = rows({ id: 'a', name: 'b', year: 1 }, { id: 'b', name: 'a', year: 2 });
  applySort(list, ASC, (r, k) => r[k]);
  expect(ids(list)).toEqual(['a', 'b']);
});

test('a header click flips its own column and adopts a default on a new one', () => {
  const start: SortState<'name' | 'year'> = { key: 'name', asc: true };
  expect(toggleSort(start, 'name')).toEqual({ key: 'name', asc: false });
  expect(toggleSort(start, 'year')).toEqual({ key: 'year', asc: true });
  // A column whose interesting end is the high one starts descending — which
  // is what `confidence` in the text review wants.
  expect(toggleSort(start, 'year', (k) => k !== 'year')).toEqual({ key: 'year', asc: false });
});
