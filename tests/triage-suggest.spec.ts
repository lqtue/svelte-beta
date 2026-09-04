/**
 * Pure checks for the triage proposal and the level0 addressing it fetches
 * through. Browser-less; they ride the Playwright runner.
 *
 * The synthetic sheet below reproduces the structure that broke the Python
 * detector on the real 1882 scan: an ink-black scan margin outside a white
 * paper margin outside the printed rule. A detector that looks for "the extent
 * of any ink" returns the whole image here, which is the bug.
 */
import { test, expect } from '@playwright/test';
import { level0TileUrl, pickScaleFactor, planOverview } from '../src/lib/core/iiif/level0';
import {
  toGrey,
  inkProfiles,
  findEdge,
  detectNeatline,
  densitiesToOverrides,
  type Grey,
} from '../src/lib/features/contribute/digitalize/suggestTriage';

const FACTORS = [1, 2, 4, 8, 16, 32, 64];

test('a clipped edge tile rounds its rendered width up', () => {
  // The constant `256,` that a naive port would use is the 404 that hid the bug.
  expect(level0TileUrl('B', 0, 0, 8192, 8192, 32)).toBe('B/0,0,8192,8192/256,/0/default.jpg');
  expect(level0TileUrl('B', 8192, 8192, 3910, 790, 32)).toBe(
    'B/8192,8192,3910,790/123,/0/default.jpg'
  );
});

test('pickScaleFactor takes the coarsest level that still delivers the width', () => {
  expect(pickScaleFactor(FACTORS, 12102, 2048)).toBe(4);
  expect(pickScaleFactor(FACTORS, 12102, 1024)).toBe(8);
  expect(pickScaleFactor(FACTORS, 512, 2048)).toBe(1); // never upscale
  expect(pickScaleFactor([], 12102, 2048)).toBe(1); // server advertised none
});

test('the overview plan tiles the whole image with no gap or overlap', () => {
  const plan = planOverview('B', 12102, 8982, FACTORS, 256, 2048);
  expect(plan.scaleFactor).toBe(4);
  expect(plan.width).toBe(Math.ceil(12102 / 4));
  // 12102/1024 -> 12 across, 8982/1024 -> 9 down
  expect(plan.tiles).toHaveLength(12 * 9);
  expect(plan.tiles[0].dx).toBe(0);
  expect(plan.tiles[0].dy).toBe(0);
  const last = plan.tiles[plan.tiles.length - 1];
  expect(last.url).toContain('11264,8192,838,790/'); // clipped in both axes
});

/** Black scan margin, white paper, a 1px rule, then mid-grey content. */
function syntheticSheet(size = 100, margin = 6, paper = 12): Grey {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(x, y, size - 1 - x, size - 1 - y);
      let v = 128; // content
      if (d < margin)
        v = 20; // ink-black scan margin
      else if (d < paper)
        v = 250; // white paper margin
      else if (d === paper) v = 10; // the printed rule
      const p = (y * size + x) * 4;
      rgba[p] = rgba[p + 1] = rgba[p + 2] = v;
      rgba[p + 3] = 255;
    }
  }
  return toGrey(rgba, size, size);
}

test('the neatline lands on the printed rule, not the extent of the ink', () => {
  const g = syntheticSheet();
  const nl = detectNeatline(g);
  expect(nl).not.toBeNull();
  const [x, y, w, h] = nl!;
  // The rule sits at index 12 on each side; the crop must start there, not at
  // 0 (which is what "bbox of anything dark" gives, because the margin is ink).
  expect(x).toBe(12);
  expect(y).toBe(12);
  expect(x + w).toBe(87);
  expect(y + h).toBe(87);
});

test('ink profiles see the margin and the paper for what they are', () => {
  const { cols } = inkProfiles(syntheticSheet());
  expect(cols[0]).toBeCloseTo(1, 2); // scan margin: all ink
  expect(cols[8]).toBeLessThan(0.2); // paper: almost none
  expect(cols[12]).toBeGreaterThan(0.5); // the rule
});

test('findEdge falls back to the paper edge when there is no rule to find', () => {
  // Margin then paper then content, with no ruled border at all.
  const prof = new Float32Array(100);
  for (let i = 0; i < 6; i++) prof[i] = 1;
  for (let i = 6; i < 100; i++) prof[i] = 0.05;
  // Never crops into the map: it stops where the scan margin ended.
  expect(findEdge(prof, false)).toBe(6);
});

test('densities become the priority map the OCR job consumes', () => {
  const tiles: [number, number, number, number][] = [
    [0, 0, 100, 100],
    [100, 0, 100, 100],
    [200, 0, 100, 100],
  ];
  const out = densitiesToOverrides(tiles, [0.5, 0.05, 0.001]);
  expect(out['0_0_100_100']).toBeUndefined(); // dense -> full res, omitted
  expect(out['100_0_100_100']).toBe('low_res');
  expect(out['200_0_100_100']).toBe('skip');
});
