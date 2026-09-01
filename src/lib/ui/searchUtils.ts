// Shared search utilities: coordinate parsing, covering map detection, bounds helpers

import type { SearchResult } from '$lib/map/types';
import type { MapListItem } from '$lib/data/maps/types';
import { haversineDistance } from '$lib/core/geo/geo';

/**
 * Parse a coordinate string into lat/lng.
 * Supports formats like:
 *   "10.776, 106.700"
 *   "10.776 106.700"
 *   "10.776,106.700"
 *
 * Uses a heuristic to determine lat vs lng:
 * - If both values are <= 90, assume lat,lng order
 * - If first > 90 and second <= 90, swap to lng,lat
 */
export function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Match two numbers separated by comma and/or whitespace
  const match = trimmed.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (!match) return null;

  const a = parseFloat(match[1]);
  const b = parseFloat(match[2]);

  if (isNaN(a) || isNaN(b)) return null;

  // Validate ranges: lat in [-90, 90], lng in [-180, 180]
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
    return { lat: a, lng: b };
  }

  // If first value looks like longitude and second like latitude, swap
  if (Math.abs(a) <= 180 && Math.abs(b) <= 90) {
    return { lat: b, lng: a };
  }

  return null;
}

/**
 * Distance from a point to the nearest edge of a bounding box (km).
 * Returns 0 if the point is inside.
 */
function distanceToBox(lng: number, lat: number, bounds: [number, number, number, number]): number {
  const [minLon, minLat, maxLon, maxLat] = bounds;
  if (lng >= minLon && lng <= maxLon && lat >= minLat && lat <= maxLat) return 0;
  const closestLon = Math.max(minLon, Math.min(lng, maxLon));
  const closestLat = Math.max(minLat, Math.min(lat, maxLat));
  return haversineDistance([lng, lat], [closestLon, closestLat]) / 1000;
}

/**
 * Area of a bounding box in square degrees (for comparing specificity).
 */
function boundsArea(bounds: [number, number, number, number]): number {
  return (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]);
}

/**
 * Find all maps near a point, sorted by distance (closest first).
 * Includes maps whose bounds contain the point (distance 0) and nearby maps within maxDistanceKm.
 */
export function findNearbyMaps(
  lat: number,
  lng: number,
  maps: MapListItem[],
  maxDistanceKm: number = 50
): MapListItem[] {
  const withDist: { map: MapListItem; dist: number }[] = [];

  for (const m of maps) {
    if (!m.bounds) continue;
    const dist = distanceToBox(lng, lat, m.bounds);
    if (dist <= maxDistanceKm) {
      withDist.push({ map: m, dist });
    }
  }

  withDist.sort((a, b) => {
    // Sort by distance first, then by specificity (smaller area first) for ties
    if (a.dist !== b.dist) return a.dist - b.dist;
    return boundsArea(a.map.bounds!) - boundsArea(b.map.bounds!);
  });

  return withDist.map((item) => item.map);
}

/**
 * Center of a bounding box.
 */
export function boundsCenter(bounds: [number, number, number, number]): {
  lng: number;
  lat: number;
} {
  return {
    lng: (bounds[0] + bounds[2]) / 2,
    lat: (bounds[1] + bounds[3]) / 2,
  };
}

/**
 * Rough zoom level estimate from bounds extent.
 */
export function boundsZoom(bounds: [number, number, number, number]): number {
  const lonSpan = bounds[2] - bounds[0];
  const latSpan = bounds[3] - bounds[1];
  const maxSpan = Math.max(lonSpan, latSpan);

  if (maxSpan <= 0) return 16;
  // Approximate: 360 degrees = zoom 1, halving each level
  const zoom = Math.log2(360 / maxSpan);
  return Math.max(2, Math.min(18, Math.round(zoom)));
}

/**
 * Build the SearchResult a "Go to <lat>, <lng>" coordinate hit dispatches.
 */
export function coordinateResult(coords: { lat: number; lng: number }): SearchResult {
  return {
    display_name: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
    lat: String(coords.lat),
    lon: String(coords.lng),
    type: 'coordinate',
  };
}
