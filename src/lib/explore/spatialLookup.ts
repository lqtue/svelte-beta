/**
 * spatialLookup.ts — picks the best historical overlay for a given lon/lat.
 *
 * Tries `maps.bbox` first (cheap, DB-side), then falls back to resolving
 * bounds from each map's Allmaps annotation at runtime via fetchMultipleBounds.
 * Most maps in the catalogue don't have `bbox` backfilled yet, so the runtime
 * resolution is what actually makes /explore find anything today.
 *
 * Client-side filtering for MVP. Cheap until the catalogue grows past a few
 * hundred entries; swap for a PostGIS RPC later without changing callers.
 */
import { fetchMultipleBounds } from '$lib/geo/mapBounds';
import type { MapListItem } from '$lib/maps/types';

export type Bbox = [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]

// VMA's editorial home base. Used as a fallback view when the user picks
// "Show all maps" or denies location — but coverage is NOT limited to
// this point; the archive covers other areas too (Hanoi, Hue, Cambodia
// border, etc.) and `/explore` treats them all equally.
export const SAIGON_CENTER: [number, number] = [106.70098, 10.77653];
export const SAIGON_DEFAULT_ZOOM = 15;

export type CoverageState =
  | 'rich'    // 2+ overlays cover this point
  | 'sparse'  // exactly 1 overlay covers this point
  | 'empty';  // no overlay covers this point

// Extends MapListItem with a resolved bbox/bounds tuple — same shape either
// way, so downstream code only ever reads `effectiveBbox`.
export interface ResolvedMap extends MapListItem {
  effectiveBbox: Bbox;
}

function bboxContainsPoint(bbox: Bbox, lon: number, lat: number): boolean {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

function bboxArea(bbox: Bbox): number {
  return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
}

function looksValid(bbox: unknown): bbox is Bbox {
  return (
    Array.isArray(bbox) &&
    bbox.length === 4 &&
    bbox.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    bbox[0] < bbox[2] &&
    bbox[1] < bbox[3]
  );
}

/**
 * Synchronous match against the already-loaded map catalogue.
 *
 * Uses each map's effective bbox: `bbox` (DB column) preferred, then `bounds`
 * (runtime enrichment from useMapList → fetchMultipleBounds). Maps with
 * neither resolved yet are skipped — they'll re-appear on the next call
 * after bounds trickle in.
 */
export function matchMapsAtPoint(
  mapList: MapListItem[],
  lon: number,
  lat: number,
): ResolvedMap[] {
  const publicOnly = mapList.filter(
    (m) =>
      (m.status === 'public' || m.status === 'featured') &&
      (!!m.allmaps_id || !!m.annotation_url),
  );
  const candidates: ResolvedMap[] = [];
  for (const m of publicOnly) {
    const candidate = looksValid(m.bbox) ? (m.bbox as Bbox) : looksValid(m.bounds) ? (m.bounds as Bbox) : null;
    if (!candidate) continue;
    if (!bboxContainsPoint(candidate, lon, lat)) continue;
    candidates.push({ ...m, effectiveBbox: candidate });
  }
  candidates.sort((a, b) => {
    const aa = bboxArea(a.effectiveBbox);
    const ba = bboxArea(b.effectiveBbox);
    if (aa !== ba) return aa - ba;
    return (b.year ?? 0) - (a.year ?? 0);
  });
  return candidates;
}

/**
 * Returns the list of allmaps_ids that haven't had bounds resolved yet.
 * Caller passes these to fetchMultipleBounds to fill the gaps; the next
 * call to matchMapsAtPoint will pick them up automatically.
 */
export function unresolvedAllmapsIds(mapList: MapListItem[]): string[] {
  return mapList
    .filter(
      (m) =>
        (m.status === 'public' || m.status === 'featured') &&
        !looksValid(m.bbox) &&
        !looksValid(m.bounds) &&
        !!m.allmaps_id,
    )
    .map((m) => m.allmaps_id!);
}

export { fetchMultipleBounds };

export function coverageStateFor(matches: ResolvedMap[]): CoverageState {
  if (matches.length >= 2) return 'rich';
  if (matches.length === 1) return 'sparse';
  return 'empty';
}
