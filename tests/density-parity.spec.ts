/**
 * The tile-density signal exists twice, and that is the whole point of this file.
 *
 * `suggestTriage.ts` proposes a triage in the browser; `compute_tile_densities`
 * in `work/ocr/scripts/iiif_tiles.py` does it headless for the automated path.
 * The TS file's own header exists because the Python one was silently wrong on
 * this corpus — fed a 1024px overview it rated the dense city centre *lower*
 * than the margins and would have skipped exactly the tiles worth reading. That
 * was a resolution bug, since fixed, but nothing stopped the two from drifting
 * apart again, and a disagreement here does not look like a bug: it looks like a
 * sheet that came back with fewer labels than you hoped.
 *
 * The fixture is real ink — a 512px window of the 1882 Saigon cadastral's 2048px
 * overview straddling the left sheet edge, so it runs through dark scan margin,
 * blank paper, the printed rule and map content, and covers all three decision
 * bands. Python's densities were computed on exactly these bytes and stored
 * beside them, so this compares the two implementations on identical input
 * rather than comparing two fetches of an image.
 *
 * Regenerate with tests/fixtures/README.md if the algorithm changes on purpose.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  toGrey,
  tileDensities,
  densitiesToOverrides,
} from '../src/lib/features/contribute/digitalize/suggestTriage';

type Fixture = {
  width: number;
  height: number;
  grey_b64: string;
  tiles: [number, number, number, number][];
  python_densities: number[];
};

const fx: Fixture = JSON.parse(
  readFileSync(new URL('./fixtures/tile-density-1882.json', import.meta.url), 'utf8')
);

/** The fixture's L bytes as the RGBA `toGrey` expects, so grey survives exactly. */
function greyAsRgba(): Uint8ClampedArray {
  const l = Buffer.from(fx.grey_b64, 'base64');
  const rgba = new Uint8ClampedArray(fx.width * fx.height * 4);
  for (let i = 0, p = 0; i < l.length; i++, p += 4) {
    rgba[p] = rgba[p + 1] = rgba[p + 2] = l[i];
    rgba[p + 3] = 255;
  }
  return rgba;
}

const grey = toGrey(greyAsRgba(), fx.width, fx.height);
const ts = tileDensities(grey, fx.tiles, fx.width, fx.height);

test('the fixture covers all three decision bands, or it is not testing the boundary', () => {
  const py = fx.python_densities;
  expect(py.filter((d) => d < 0.01).length).toBeGreaterThan(0);
  expect(py.filter((d) => d >= 0.01 && d < 0.08).length).toBeGreaterThan(0);
  expect(py.filter((d) => d >= 0.08).length).toBeGreaterThan(0);
});

test('R=G=B means grey passes through toGrey untouched', () => {
  // 0.299 + 0.587 + 0.114 = 1, so a grey pixel must survive exactly. If it did
  // not, every number below would be comparing two different images.
  const l = Buffer.from(fx.grey_b64, 'base64');
  for (const i of [0, 1, 500, 12345, l.length - 1]) {
    expect(grey.data[i]).toBeCloseTo(l[i], 4);
  }
});

test('both implementations agree on every tile, to within border handling', () => {
  expect(ts).toHaveLength(fx.python_densities.length);
  const deltas = ts.map((v, i) => Math.abs(v - fx.python_densities[i]));
  const worst = Math.max(...deltas);
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  // scipy's uniform_filter reflects at the image border; the TS clamps the
  // window and renormalises by its real area. Interior tiles should be
  // near-identical and edge tiles close. A gap past this is drift, not policy.
  expect(mean, `mean |TS - Python| = ${mean.toFixed(5)}`).toBeLessThan(0.01);
  expect(worst, `worst tile |TS - Python| = ${worst.toFixed(5)}`).toBeLessThan(0.05);
});

test('and agree on what each tile is FOR — the decision, not the number', () => {
  // This is the assertion that matters: a density is only ever consumed as
  // skip / low_res / normal, and a sheet read with the wrong ones comes back
  // looking merely disappointing.
  const decide = (d: number) => (d < 0.01 ? 'skip' : d < 0.08 ? 'low_res' : 'normal');
  const tsCalls = ts.map(decide);
  const pyCalls = fx.python_densities.map(decide);
  const differing = tsCalls
    .map((c, i) => ({
      i,
      tile: fx.tiles[i],
      c,
      py: pyCalls[i],
      ts: ts[i],
      pyd: fx.python_densities[i],
    }))
    .filter((r) => r.c !== r.py);
  expect(
    differing,
    `tiles judged differently: ${JSON.stringify(differing.slice(0, 6))}`
  ).toHaveLength(0);
});

test('densitiesToOverrides emits only the two priorities the OCR job understands', () => {
  const overrides = densitiesToOverrides(fx.tiles, ts);
  const values = new Set(Object.values(overrides));
  for (const v of values) expect(['skip', 'low_res']).toContain(v);
  // A normal tile is absent rather than present-and-normal: ocr.py reads a
  // missing key as full render, and writing 'normal' would look like a skip
  // that failed to apply.
  const normal = ts.filter((d) => d >= 0.08).length;
  expect(Object.keys(overrides)).toHaveLength(fx.tiles.length - normal);
});
