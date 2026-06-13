/**
 * Great-circle bearing from a → b, in degrees clockwise from true north.
 * Inputs are [lon, lat] in EPSG:4326.
 */
export function bearingDeg(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const Δλ = toRad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = [
  { label: 'N', arrow: '↑' },
  { label: 'NE', arrow: '↗' },
  { label: 'E', arrow: '→' },
  { label: 'SE', arrow: '↘' },
  { label: 'S', arrow: '↓' },
  { label: 'SW', arrow: '↙' },
  { label: 'W', arrow: '←' },
  { label: 'NW', arrow: '↖' },
];

/**
 * 8-way compass bucket: N at 0°/360°, each bucket spans 45°.
 */
export function compassLabel(deg: number): { arrow: string; label: string } {
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return COMPASS[idx];
}
