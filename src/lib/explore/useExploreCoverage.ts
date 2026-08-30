/**
 * useExploreCoverage.ts — the "which maps cover this point?" bookkeeping that
 * /explore used to carry inline.
 *
 * Two things are entangled here and both have to stay that way:
 *
 *  1. `matches` — a pure client-side filter of the already-loaded catalogue.
 *  2. `loading` — whether a bounds fetch is still pending for a map we have
 *     never tried. Some annotations have no GCPs / 404 on allmaps.org (e.g.
 *     R2-mirrored drafts) and resolve to `null`; those can never become valid,
 *     so without tracking attempts the "Looking up maps…" spinner would spin
 *     forever. `loading` means "a fetch is still pending for a map we haven't
 *     tried", NOT "every map produced a bbox".
 */
import type { MapListItem } from '$lib/map/types';
import { annotationSourceFor, fetchMultipleBounds } from '$lib/geo/mapBounds';
import { matchMapsAtPoint, unresolvedBoundsSources, type ResolvedMap } from './spatialLookup';

export interface ExploreCoverageOptions {
  getMapList: () => MapListItem[];
  setMapList: (list: MapListItem[]) => void;
  /** Admins/mods get draft maps in coverage too (mirrors the browse panel). */
  canSeeDrafts: () => boolean;
  setLoading: (loading: boolean) => void;
}

export interface ExploreCoverage {
  /** Annotation sources still awaiting a first bounds attempt. */
  pendingBoundsIds(): string[];
  /** Maps covering `lon`/`lat`, smallest-bbox first. */
  matchAt(lon: number, lat: number): ResolvedMap[];
  /** Fetches bounds for anything not yet attempted and backfills `mapList`. */
  ensureBoundsResolved(): Promise<void>;
}

export function createExploreCoverage(opts: ExploreCoverageOptions): ExploreCoverage {
  const { getMapList, setMapList, canSeeDrafts, setLoading } = opts;

  // Maps whose bounds we've already tried to resolve.
  const attemptedBounds = new Set<string>();

  function pendingBoundsIds(): string[] {
    return unresolvedBoundsSources(getMapList(), canSeeDrafts()).filter(
      (id) => !attemptedBounds.has(id)
    );
  }

  function matchAt(lon: number, lat: number): ResolvedMap[] {
    return matchMapsAtPoint(getMapList(), lon, lat, canSeeDrafts());
  }

  async function ensureBoundsResolved(): Promise<void> {
    const need = pendingBoundsIds();
    if (need.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    for (const id of need) attemptedBounds.add(id);
    const resolved = await fetchMultipleBounds(need, 12);
    setMapList(
      getMapList().map((m) => {
        const src = annotationSourceFor(m);
        const b = src ? resolved.get(src) : undefined;
        return b ? { ...m, bounds: b } : m;
      })
    );
    // Clears once every needed map has been attempted, even if some yielded no
    // bbox — the reassignment above re-triggers the caller's reactive block,
    // which then exits through the `need.length === 0` branch.
    setLoading(pendingBoundsIds().length > 0);
  }

  return { pendingBoundsIds, matchAt, ensureBoundsResolved };
}
