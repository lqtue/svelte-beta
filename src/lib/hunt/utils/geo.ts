const EARTH_RADIUS = 6371000; // meters

/**
 * Haversine distance between two [lon, lat] points in meters
 */
export function haversineDistance(a: [number, number], b: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

/**
 * Checks if position is within radius meters of target
 */
export function isWithinRadius(
  position: [number, number],
  target: [number, number],
  radiusMeters: number
): boolean {
  return haversineDistance(position, target) <= radiusMeters;
}
