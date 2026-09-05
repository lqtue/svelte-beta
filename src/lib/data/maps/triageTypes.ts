/**
 * The saved triage (migration 069/070) — what a person asserts about a sheet
 * before any tile is read.
 *
 * Two things live here. The **neatline** and the tile grid steer how the main
 * body is cut up. The **regions** say what the sheet is made of: a map, a title
 * block, a legend, an index of street names, furniture. They exist because a
 * sheet is not one thing, and tiling all of it reads the legend as if it were
 * terrain — paying full price to OCR a key.
 *
 * All pixel values are **source** pixels (the `info.json` full size), the same
 * space `ocr_extractions.global_*` uses.
 */

/** `sheet` is the whole printed object; `main_map` the cartographic body inside
 *  it. They differ by exactly the furniture, which is the useful part. */
export const LAYOUT_CATEGORIES = [
  'sheet',
  'main_map',
  'title',
  'legend',
  'name_list',
  'inset',
  'scale_bar',
  'north_arrow',
  'stamp',
] as const;

export type LayoutCategory = (typeof LAYOUT_CATEGORIES)[number];

/** Regions the tiling pass should read. Everything else is skipped or handled
 *  by a pass of its own (`--legend` for a key, one call for a title block). */
export const TILEABLE_CATEGORIES: readonly LayoutCategory[] = ['main_map', 'inset'];

/** Never worth a tile: it is furniture, or it is not the map. */
export const SKIP_CATEGORIES: readonly LayoutCategory[] = ['scale_bar', 'north_arrow', 'stamp'];

export const LAYOUT_LABELS: Record<LayoutCategory, string> = {
  sheet: 'Sheet',
  main_map: 'Main map',
  title: 'Title block',
  legend: 'Legend',
  name_list: 'Name list',
  inset: 'Inset',
  scale_bar: 'Scale bar',
  north_arrow: 'North arrow',
  stamp: 'Stamp',
};

/** Distinct hues so nine overlapping boxes stay tellable apart on one canvas. */
export const LAYOUT_COLORS: Record<LayoutCategory, string> = {
  sheet: '#94a3b8',
  main_map: '#2563eb',
  title: '#d946ef',
  legend: '#f59e0b',
  name_list: '#10b981',
  inset: '#6366f1',
  scale_bar: '#64748b',
  north_arrow: '#64748b',
  stamp: '#ef4444',
};

import type { MapGrid } from '$lib/core/geo/mapGrid';

/** `[x, y, width, height]` in source pixels. */
export type RegionBox = [number, number, number, number];

export type LayoutRegion = {
  category: LayoutCategory;
  bbox: RegionBox;
  confidence: number;
  /** `model` came from the layout pass; `human` was drawn or corrected here. */
  source: 'model' | 'human';
  notes?: string;
};

export type SavedTriage = {
  neatline?: RegionBox;
  regions?: LayoutRegion[];
  regions_at?: string;
  /** The sheet's printed reference grid, so an index entry's "J 6" becomes a
   *  position without spotting a single numeral on the map body. */
  grid?: MapGrid;
  grid_at?: string;
  tile_size?: number;
  overlap?: number;
  tile_overrides?: Record<string, 'skip' | 'low_res'>;
  saved_at?: string;
  saved_by?: string;
};

export function isLayoutCategory(v: unknown): v is LayoutCategory {
  return typeof v === 'string' && (LAYOUT_CATEGORIES as readonly string[]).includes(v);
}

/**
 * Validate one region off the wire. Returns null rather than throwing, so a
 * single bad row from the model costs that row and not the whole pass.
 */
export function parseRegion(raw: unknown): LayoutRegion | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isLayoutCategory(r.category)) return null;
  const bb = r.bbox;
  if (!Array.isArray(bb) || bb.length !== 4) return null;
  const nums = bb.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  // A zero-area box is the model filling a slot it could not see.
  if (nums[2] < 1 || nums[3] < 1) return null;
  const conf = Number(r.confidence);
  return {
    category: r.category,
    bbox: [Math.round(nums[0]), Math.round(nums[1]), Math.round(nums[2]), Math.round(nums[3])],
    confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0,
    source: r.source === 'human' ? 'human' : 'model',
    ...(typeof r.notes === 'string' && r.notes ? { notes: r.notes } : {}),
  };
}

/**
 * The rectangle the tiling pass should actually cover.
 *
 * Preference order is deliberate: a `main_map` region is the model's answer to
 * "where is the terrain", which is a better crop than the neatline, because the
 * neatline includes whatever furniture is printed inside the border. Fall back
 * to the hand-drawn neatline, then to nothing (which means the whole sheet).
 */
export function tilingCrop(triage: SavedTriage | null | undefined): RegionBox | null {
  if (!triage) return null;
  const main = (triage.regions ?? []).find((r) => r.category === 'main_map');
  if (main) return main.bbox;
  if (triage.neatline && triage.neatline.length === 4) return triage.neatline;
  return null;
}
