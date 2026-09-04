/**
 * The layout pass's contract: what comes back from the model is untrusted, and
 * what steers the tile grid must be the right rectangle.
 *
 * Browser-less pure checks, riding the Playwright runner like the rest.
 */
import { test, expect } from '@playwright/test';
import {
  parseRegion,
  tilingCrop,
  LAYOUT_CATEGORIES,
  SKIP_CATEGORIES,
  TILEABLE_CATEGORIES,
  type LayoutRegion,
  type SavedTriage,
} from '../src/lib/data/maps/triageTypes';

const region = (over: Partial<LayoutRegion> = {}): LayoutRegion => ({
  category: 'main_map',
  bbox: [10, 20, 300, 400],
  confidence: 0.9,
  source: 'model',
  ...over,
});

test('a well-formed region survives the round trip', () => {
  const parsed = parseRegion(region());
  expect(parsed).toEqual({
    category: 'main_map',
    bbox: [10, 20, 300, 400],
    confidence: 0.9,
    source: 'model',
  });
});

test('a category the vocabulary does not know is dropped, not coerced', () => {
  // The model is capable of inventing "compass_rose"; storing it would put a
  // value in maps.triage that no UI can draw and no enum accepts.
  expect(parseRegion(region({ category: 'compass_rose' as never }))).toBeNull();
});

test('a zero-area box is the model filling a slot it could not see', () => {
  expect(parseRegion(region({ bbox: [100, 100, 0, 50] }))).toBeNull();
  expect(parseRegion(region({ bbox: [100, 100, 50, 0] }))).toBeNull();
});

test('a malformed bbox is dropped rather than half-read', () => {
  expect(parseRegion(region({ bbox: [1, 2, 3] as never }))).toBeNull();
  expect(parseRegion(region({ bbox: [1, 2, 3, Number.NaN] }))).toBeNull();
  expect(parseRegion(null)).toBeNull();
  expect(parseRegion('main_map')).toBeNull();
});

test('confidence is clamped, never trusted', () => {
  expect(parseRegion(region({ confidence: 7 }))?.confidence).toBe(1);
  expect(parseRegion(region({ confidence: -3 }))?.confidence).toBe(0);
  expect(parseRegion({ ...region(), confidence: 'high' })?.confidence).toBe(0);
});

test("a corrected region is a human's; anything else is the model's", () => {
  expect(parseRegion(region({ source: 'human' }))?.source).toBe('human');
  expect(parseRegion(region({ source: 'wishful' as never }))?.source).toBe('model');
});

test('fractional pixels round — the tile grid is addressed in whole ones', () => {
  expect(parseRegion(region({ bbox: [10.4, 20.6, 300.5, 400.2] }))?.bbox).toEqual([
    10, 21, 301, 400,
  ]);
});

test('main_map wins over the neatline as the tiling crop', () => {
  // The point of the whole pass: the neatline is the printed border, and a
  // legend printed inside it is inside the neatline too.
  const triage: SavedTriage = {
    neatline: [0, 0, 5000, 4000],
    regions: [region({ category: 'legend', bbox: [4000, 0, 1000, 4000] }), region()],
  };
  expect(tilingCrop(triage)).toEqual([10, 20, 300, 400]);
});

test('with no main_map the hand-drawn neatline still steers the grid', () => {
  expect(tilingCrop({ neatline: [1, 2, 3, 4], regions: [region({ category: 'legend' })] })).toEqual(
    [1, 2, 3, 4]
  );
  expect(tilingCrop({ regions: [] })).toBeNull();
  expect(tilingCrop(null)).toBeNull();
});

test('the vocabulary partitions into what is read and what is skipped', () => {
  // Every category is accounted for by exactly one intent, or it is furniture
  // nobody decided about — which is how a region silently gets OCR'd.
  for (const c of [...SKIP_CATEGORIES, ...TILEABLE_CATEGORIES]) {
    expect(LAYOUT_CATEGORIES).toContain(c);
  }
  for (const c of TILEABLE_CATEGORIES) expect(SKIP_CATEGORIES).not.toContain(c);
});
