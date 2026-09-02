import { expect, test } from '@playwright/test';
import { stepByYear, timeOrder } from '../src/lib/features/explore/exploreKeys';
import type { MapListItem } from '../src/lib/data/maps/types';

/** Pure checks for the /explore time scrubber. No browser, no network. */

const m = (id: string, year: number | null, extra: Partial<MapListItem> = {}) =>
  ({ id, year, name: id, allmaps_id: `a${id}`, ...extra }) as MapListItem;

const MAPS = [m('c', 1923), m('a', 1878), m('b', 1898), m('d', 1968)];

test('timeOrder is oldest first and drops maps that cannot be overlaid', () => {
  const withOrphan = [...MAPS, m('no-georef', 1900, { allmaps_id: undefined, annotation_url: undefined })];
  expect(timeOrder(withOrphan).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
});

test('undated maps sort last rather than first', () => {
  expect(timeOrder([m('z', null), ...MAPS]).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'z']);
});

test('stepping walks the years in both directions', () => {
  expect(stepByYear(MAPS, 'b', 1)?.id).toBe('c');
  expect(stepByYear(MAPS, 'b', -1)?.id).toBe('a');
});

test('the walk stops at each end instead of wrapping', () => {
  expect(stepByYear(MAPS, 'a', -1)).toBeNull();
  expect(stepByYear(MAPS, 'd', 1)).toBeNull();
});

test('an unknown or absent current map gives nothing to step from', () => {
  expect(stepByYear(MAPS, 'not-here', 1)).toBeNull();
  expect(stepByYear(MAPS, null, 1)).toBeNull();
  expect(stepByYear([], 'a', 1)).toBeNull();
});
