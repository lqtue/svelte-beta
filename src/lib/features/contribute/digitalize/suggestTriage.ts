/**
 * Propose a triage — a neatline and a per-tile priority grid — for a human to
 * correct. It never saves; the person still presses Save.
 *
 * Both signals were measured against the 1882 Saigon cadastral on 2026-09-04,
 * because the Python equivalents were wrong on it in ways nobody could see:
 *
 *   * `detect_neatline` is "bounding box of anything darker than 230", and this
 *     sheet's scan margins are ink-black (100% below that threshold, median
 *     grey 26–116 on all four edges). It returned None, so `--smart-grid`
 *     cropped nothing at all. The profile walk below finds the printed rule
 *     instead of the extent of any ink, and lands on it: 81% of the scan.
 *
 *   * `compute_tile_densities` is resolution-critical and the pipeline fed it a
 *     1024px overview. Measured centre-vs-edge mean density: 0.019 vs 0.134 at
 *     600px, 0.044 vs 0.129 at 1024px, 0.106 vs 0.140 at 1513px — all
 *     INVERTED, i.e. it rates the dense city centre *lower* than the margins
 *     and would demote exactly the tiles worth reading. It only comes right at
 *     2048px (0.166 vs 0.139). Hence OVERVIEW_WIDTH below; do not lower it.
 *
 * The colour/wash pre-pass is deliberately absent. On this sheet every
 * saturated pixel sits in hue 0–60° (warm aged paper and the pink parcel
 * tints); `compute_tile_colours` looks at 60–260° and scored 0.000 on every
 * tile at every saturation gate down to 0.10. It fires on nothing here, so
 * shipping it would be shipping an untested signal.
 */

import { buildTileGrid, tileKey, type TileOverrides } from './tileParams';
import { planOverview } from '$lib/core/iiif/level0';

/** Below this the density measure inverts — see the module comment. */
export const OVERVIEW_WIDTH = 2048;

/** Local std-dev above which a pixel neighbourhood reads as ink rather than tint. */
const TEXT_THRESHOLD = 25;
const SKIP_BELOW = 0.01;
const LOW_RES_BELOW = 0.08;

export type Grey = { data: Float32Array; width: number; height: number };

/** Rec. 601 luma, the same weighting `Image.convert("L")` uses. */
export function toGrey(rgba: Uint8ClampedArray, width: number, height: number): Grey {
  const data = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    data[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  }
  return { data, width, height };
}

/**
 * Fraction of each column and row that is ink.
 *
 * The neatline walk needs both profiles and nothing else, so they are computed
 * in one pass over the image rather than two.
 */
export function inkProfiles(g: Grey, threshold = 200): { cols: Float32Array; rows: Float32Array } {
  const cols = new Float32Array(g.width);
  const rows = new Float32Array(g.height);
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      if (g.data[y * g.width + x] < threshold) {
        cols[x]++;
        rows[y]++;
      }
    }
  }
  for (let x = 0; x < g.width; x++) cols[x] /= g.height;
  for (let y = 0; y < g.height; y++) rows[y] /= g.width;
  return { cols, rows };
}

/**
 * Walk in from one end of a profile to the printed rule.
 *
 * A scanned sheet reads, from the edge inward: dark scan margin (nearly all
 * ink) → white paper (almost none) → the ruled border (a sharp spike) → map
 * content. So: skip the margin, cross the paper, stop at the first spike. If no
 * spike appears within `maxFraction`, fall back to where the paper began, which
 * at worst crops the scan margin and never crops into the map.
 */
export function findEdge(
  profile: Float32Array,
  fromEnd: boolean,
  { paper = 0.15, rule = 0.5, maxFraction = 0.3 } = {}
): number {
  const n = profile.length;
  const at = (i: number) => profile[fromEnd ? n - 1 - i : i];
  const limit = Math.floor(n * maxFraction);
  let i = 0;
  while (i < limit && at(i) >= paper) i++;
  const paperStart = i;
  while (i < limit && at(i) <= rule) i++;
  const hit = i < limit ? i : paperStart;
  return fromEnd ? n - 1 - hit : hit;
}

/** Neatline in overview pixels, or null when the walk finds no usable crop. */
export function detectNeatline(g: Grey): [number, number, number, number] | null {
  const { cols, rows } = inkProfiles(g);
  const left = findEdge(cols, false);
  const right = findEdge(cols, true);
  const top = findEdge(rows, false);
  const bottom = findEdge(rows, true);
  const w = right - left;
  const h = bottom - top;
  if (w < g.width * 0.3 || h < g.height * 0.3) return null;
  return [left, top, w, h];
}

/**
 * Per-tile text density: the share of a tile whose local 8×8 std-dev clears
 * `TEXT_THRESHOLD`. High-frequency ink (lettering, hatching) scores; flat wash
 * and blank paper do not. Ported from `compute_tile_densities`.
 */
export function tileDensities(
  g: Grey,
  tiles: [number, number, number, number][],
  fullW: number,
  fullH: number
): number[] {
  const { width: w, height: h, data } = g;
  // Summed-area tables give the 8×8 mean and mean-of-squares in O(1) per pixel,
  // which keeps a 2048px overview interactive instead of a visible freeze.
  const n = (w + 1) * (h + 1);
  const s1 = new Float64Array(n);
  const s2 = new Float64Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x];
      const i = (y + 1) * (w + 1) + (x + 1);
      s1[i] = v + s1[i - 1] + s1[i - (w + 1)] - s1[i - (w + 1) - 1];
      s2[i] = v * v + s2[i - 1] + s2[i - (w + 1)] - s2[i - (w + 1) - 1];
    }
  }
  const box = (s: Float64Array, x0: number, y0: number, x1: number, y1: number) =>
    s[y1 * (w + 1) + x1] - s[y0 * (w + 1) + x1] - s[y1 * (w + 1) + x0] + s[y0 * (w + 1) + x0];

  const R = 4; // 8×8 window
  const isText = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - R);
    const y1 = Math.min(h, y + R);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - R);
      const x1 = Math.min(w, x + R);
      const area = (x1 - x0) * (y1 - y0);
      const mean = box(s1, x0, y0, x1, y1) / area;
      const variance = box(s2, x0, y0, x1, y1) / area - mean * mean;
      if (Math.sqrt(Math.max(variance, 0)) > TEXT_THRESHOLD) isText[y * w + x] = 1;
    }
  }

  return tiles.map(([tx, ty, tw, th]) => {
    const ox = Math.floor((tx / fullW) * w);
    const oy = Math.floor((ty / fullH) * h);
    const ow = Math.max(1, Math.floor((tw / fullW) * w));
    const oh = Math.max(1, Math.floor((th / fullH) * h));
    let hits = 0;
    let total = 0;
    for (let y = oy; y < Math.min(oy + oh, h); y++) {
      for (let x = ox; x < Math.min(ox + ow, w); x++) {
        hits += isText[y * w + x];
        total++;
      }
    }
    return total ? hits / total : 0;
  });
}

/** Densities → the `{"x_y_w_h": "skip"|"low_res"}` map the OCR job consumes. */
export function densitiesToOverrides(
  tiles: [number, number, number, number][],
  densities: number[]
): TileOverrides {
  const out: TileOverrides = {};
  tiles.forEach((t, i) => {
    const d = densities[i];
    if (d < SKIP_BELOW) out[tileKey(...t)] = 'skip';
    else if (d < LOW_RES_BELOW) out[tileKey(...t)] = 'low_res';
  });
  return out;
}

export type TriageProposal = {
  neatline: [number, number, number, number];
  tileOverrides: TileOverrides;
};

/** Fetch the pyramid overview and turn it into a proposal. Browser only. */
export async function suggestTriage(
  iiifBase: string,
  imgWidth: number,
  imgHeight: number,
  scaleFactors: number[],
  pyramidTileSize: number,
  tileSize: number,
  overlap: number
): Promise<TriageProposal> {
  const plan = planOverview(
    iiifBase,
    imgWidth,
    imgHeight,
    scaleFactors,
    pyramidTileSize,
    OVERVIEW_WIDTH
  );
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get a 2D context to assemble the overview');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, plan.width, plan.height);

  const loaded = await Promise.all(
    plan.tiles.map(
      (t) =>
        new Promise<{ img: HTMLImageElement; dx: number; dy: number } | null>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve({ img, dx: t.dx, dy: t.dy });
          // A pyramid often advertises a scale factor it never wrote; a missing
          // tile costs accuracy in one corner, not the whole proposal.
          img.onerror = () => resolve(null);
          img.src = t.url;
        })
    )
  );
  let drawn = 0;
  for (const t of loaded) {
    if (!t) continue;
    ctx.drawImage(t.img, t.dx, t.dy);
    drawn++;
  }
  if (!drawn) throw new Error('No overview tiles could be loaded from this IIIF source');

  const { data } = ctx.getImageData(0, 0, plan.width, plan.height);
  const grey = toGrey(data, plan.width, plan.height);

  const detected = detectNeatline(grey);
  const sx = imgWidth / plan.width;
  const sy = imgHeight / plan.height;
  const neatline: [number, number, number, number] = detected
    ? [
        Math.round(detected[0] * sx),
        Math.round(detected[1] * sy),
        Math.round(detected[2] * sx),
        Math.round(detected[3] * sy),
      ]
    : [0, 0, imgWidth, imgHeight];

  const tiles = buildTileGrid(...neatline, tileSize, overlap);
  return {
    neatline,
    tileOverrides: densitiesToOverrides(tiles, tileDensities(grey, tiles, imgWidth, imgHeight)),
  };
}
