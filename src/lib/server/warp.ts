/**
 * warp.ts — pixel → geography, for the place-time index.
 *
 * Design: `docs/platform-design.md` §0. Pixel coordinates are the master; the
 * `geom` columns are derived. This module is what the writers use to fill them,
 * and what the `warp` job uses to refill them after a re-georeference.
 *
 * Three things travel with every warp:
 *   geom      — the warped geography, as EWKT (PostGIS parses it on insert)
 *   geom_src  — a short hash of the GCP set used, so a stale row is queryable
 *   geom_rmse — that map's own GCP residual in metres
 */

import type { GcpTransformer } from '@allmaps/transform';
import { getTransformer } from './transformer';

export interface MapWarp {
  transformer: GcpTransformer;
  /** Short hash of the GCP set — changes exactly when the georeference does. */
  src: string;
  /** RMS of the GCP residuals, in metres. Null when it cannot be computed. */
  rmse: number | null;
}

const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle metres between two lng/lat pairs. */
function distanceMetres([lng1, lat1]: number[], [lng2, lat2]: number[]): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Warp error, measured the only way the library allows: push each GCP's own
 * resource coordinate through the transform and compare with where the GCP
 * says it belongs. `@allmaps/transform` keeps its residuals private, but it
 * exposes the GCPs, and a handful of round trips is cheap.
 *
 * A thin-plate spline interpolates its control points exactly, so this reads
 * ~0 for RBF-type transforms. It is honest about polynomial and Helmert fits,
 * which is where the large errors actually live.
 */
export function gcpRmseMetres(transformer: GcpTransformer): number | null {
  const gcps = transformer.gcps;
  if (!gcps?.length) return null;
  let sum = 0;
  let n = 0;
  for (const gcp of gcps) {
    try {
      const got = transformer.transformToGeo(gcp.resource as [number, number]);
      sum += distanceMetres(got, gcp.geo) ** 2;
      n++;
    } catch {
      /* a GCP the transform cannot round-trip tells us nothing; skip it */
    }
  }
  return n ? Math.sqrt(sum / n) : null;
}

/**
 * Identity of the georeference a warp was computed against. Rounded to ~1e-7°
 * (about a centimetre) so floating-point noise does not invent a new version.
 */
export async function gcpSrcHash(transformer: GcpTransformer): Promise<string> {
  const gcps = transformer.gcps ?? [];
  const canonical = gcps
    .map(
      (g) =>
        `${Math.round(g.resource[0])},${Math.round(g.resource[1])}:` +
        `${g.geo[0].toFixed(7)},${g.geo[1].toFixed(7)}`
    )
    .sort()
    .join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Resolve a map's transformer plus the two provenance fields. Null if it has no usable annotation. */
export async function resolveMapWarp(
  allmapsId: string | null | undefined,
  annotationUrl?: string | null
): Promise<MapWarp | null> {
  const resolved = await getTransformer(allmapsId, annotationUrl);
  if (!resolved) return null;
  const { transformer } = resolved;
  return { transformer, src: await gcpSrcHash(transformer), rmse: gcpRmseMetres(transformer) };
}

function coord(lng: number, lat: number): string {
  return `${lng.toFixed(8)} ${lat.toFixed(8)}`;
}

/**
 * EWKT point for a pixel coordinate, or null when the transform refuses it.
 *
 * ponytail: EWKT text rather than a geometry object, because PostgREST hands a
 * string straight to the geography input function and there is nothing to
 * install. If a writer ever needs the numbers back, use `transformToGeo`
 * directly instead of parsing this.
 */
export function pointEwkt(warp: MapWarp, pixel: [number, number]): string | null {
  try {
    const [lng, lat] = warp.transformer.transformToGeo(pixel);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return `SRID=4326;POINT(${coord(lng, lat)})`;
  } catch {
    return null;
  }
}

/**
 * EWKT polygon for a pixel ring. Closes the ring, and refuses anything that
 * cannot make one (fewer than three distinct points, or an unwarpable vertex) —
 * a line trace has no polygon, and inventing one would put a fake area in the
 * index.
 */
export function polygonEwkt(warp: MapWarp, ring: [number, number][]): string | null {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const out: string[] = [];
  for (const p of ring) {
    if (!Array.isArray(p) || p.length < 2) return null;
    try {
      const [lng, lat] = warp.transformer.transformToGeo([p[0], p[1]]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      out.push(coord(lng, lat));
    } catch {
      return null;
    }
  }
  if (out[0] !== out[out.length - 1]) out.push(out[0]);
  if (new Set(out).size < 3) return null;
  return `SRID=4326;POLYGON((${out.join(', ')}))`;
}

/** The centre of an extraction's full-image bbox, which is what gets indexed. */
export function bboxCentre(row: {
  global_x?: number | null;
  global_y?: number | null;
  global_w?: number | null;
  global_h?: number | null;
}): [number, number] | null {
  if (row.global_x == null || row.global_y == null) return null;
  return [row.global_x + (row.global_w ?? 0) / 2, row.global_y + (row.global_h ?? 0) / 2];
}
