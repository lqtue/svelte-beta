/**
 * What still stands between a sheet and an OCR run.
 *
 * This predicate decides whether a sheet is queued, so getting it wrong is
 * either money spent on a crop nobody checked or — the way it actually failed —
 * a fleet script whose default mode queued **nothing across the whole corpus**
 * while reporting success. The old gate was `triage.neatline`, and 101
 * georeferenced maps had zero neatlines between them, while 37 already carried
 * the `main_map` region that `tilingCrop` prefers to a neatline anyway.
 *
 * `enqueue_ocr_all.mjs` is plain .mjs and cannot import this module, so it
 * carries a hand copy of the same rule. These cases are the contract both sides
 * are held to.
 */
import { test, expect } from '@playwright/test';
import {
  triageState,
  tilingCrop,
  TRIAGE_STATE_LABELS,
  type SavedTriage,
  type LayoutRegion,
} from '../src/lib/data/maps/triageTypes';

const region = (category: LayoutRegion['category'], bbox: [number, number, number, number]) =>
  ({ category, bbox, confidence: 0.98, source: 'model' }) as LayoutRegion;

// The real numbers from the 1882 Saigon cadastral's layout pass.
const MAIN_MAP = region('main_map', [447, 431, 11085, 7886]);

test('nothing at all means the layout pass has not run', () => {
  expect(triageState(null)).toBe('needs_layout');
  expect(triageState(undefined)).toBe('needs_layout');
  expect(triageState({})).toBe('needs_layout');
});

test('a layout pass that found no main map needs a person, not a guess', () => {
  const t: SavedTriage = {
    regions: [region('sheet', [0, 0, 12102, 8982]), region('title', [786, 628, 2178, 1482])],
  };
  expect(triageState(t)).toBe('needs_crop');
  // And it must not be queueable: there is no crop to tile.
  expect(tilingCrop(t)).toBeNull();
});

test('a main_map region alone is a proposal — queueable only once accepted', () => {
  const t: SavedTriage = { regions: [MAIN_MAP], neatline: MAIN_MAP.bbox, neatline_src: 'main_map' };
  expect(triageState(t)).toBe('proposed');
  expect(tilingCrop(t)).toEqual(MAIN_MAP.bbox);
  expect(triageState({ ...t, validated_at: '2026-09-08T00:00:00Z' })).toBe('ready');
});

test('a hand-drawn crop is a proposal too until somebody accepts it', () => {
  // Drawing is not accepting: the Save button does both, but a triage restored
  // from a draft has a neatline and no validated_at.
  const t: SavedTriage = { neatline: [10, 10, 500, 400], neatline_src: 'human' };
  expect(triageState(t)).toBe('proposed');
  expect(triageState({ ...t, validated_at: '2026-09-08T00:00:00Z' })).toBe('ready');
});

test('an acceptance without a crop is not ready — it has nothing to tile', () => {
  // Withdrawing a crop must not leave a stale acceptance queueing an empty run.
  expect(triageState({ validated_at: '2026-09-08T00:00:00Z' })).toBe('needs_layout');
  expect(
    triageState({ validated_at: '2026-09-08T00:00:00Z', regions: [region('title', [0, 0, 9, 9])] })
  ).toBe('needs_crop');
});

test('main_map still beats a neatline, because the neatline includes the legend', () => {
  // The printed border encloses a legend printed inside it; main_map does not.
  const t: SavedTriage = {
    neatline: [0, 0, 12102, 8982],
    regions: [MAIN_MAP],
    validated_at: '2026-09-08T00:00:00Z',
  };
  expect(tilingCrop(t)).toEqual(MAIN_MAP.bbox);
  expect(triageState(t)).toBe('ready');
});

test('every state has a line a person can read', () => {
  for (const state of ['ready', 'proposed', 'needs_crop', 'needs_layout'] as const) {
    expect(TRIAGE_STATE_LABELS[state]).toBeTruthy();
  }
});
