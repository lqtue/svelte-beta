/**
 * Datum correction for hand-entered GCP coordinates.
 *
 * Coordinates read off a historical map's printed graticule are in the map's
 * own datum, not WGS84, and land 200–500 m out. This applies a Helmert
 * 3-parameter geocentric translation (towgs84 = [dX, dY, dZ], metres, from the
 * EPSG registry) to shift them onto WGS84.
 *
 * Extracted verbatim from NeatlineEditor.svelte — pure maths, no UI.
 */

export interface DatumPreset {
  label: string;
  /** Source ellipsoid semi-major axis (m) */
  a: number;
  /** Source ellipsoid semi-minor axis (m) */
  b: number;
  /** Geocentric translation to WGS84 (m) */
  dX: number;
  dY: number;
  dZ: number;
}

export const DATUM_PRESETS: DatumPreset[] = [
  {
    // EPSG:4131 — the datum explicitly printed on US Army / AMS maps
    // of Vietnam (including the Hà Tiên / Zone 48 series).
    // Everest 1830 Modified (EPSG:7018): a differs from the 1975/1954 variants.
    // towgs84 from EPSG transformation 1052 (mainland South Vietnam).
    label: 'Indian 1960 — EPSG:4131 · US Army AMS maps, southern Vietnam (Everest Mod.)',
    a: 6377304.063,
    b: 6356103.038993155,
    dX: 198,
    dY: 881,
    dZ: 317,
  },
  {
    // Con Son island variant — same datum, slightly different regional fit
    label: 'Indian 1960 — EPSG:4131 · Con Son Island variant (EPSG transform 1053)',
    a: 6377304.063,
    b: 6356103.038993155,
    dX: 182,
    dY: 915,
    dZ: 344,
  },
  {
    // Used on some Thai / northern-Vietnam sheets
    label: 'Indian 1975 — EPSG:4240 (Thailand / northern Indochina, Everest 1830 orig.)',
    a: 6377276.345,
    b: 6356075.41314024,
    dX: 210,
    dY: 814,
    dZ: 289,
  },
  {
    label: 'Indian 1954 — EPSG:4239 (alternative SE-Asia fit, Everest 1830 orig.)',
    a: 6377276.345,
    b: 6356075.41314024,
    dX: 217,
    dY: 823,
    dZ: 299,
  },
  {
    label: 'Pulkovo 1942 / Gauss-Krüger (Soviet-era Vietnamese maps, Krassowsky)',
    a: 6378245.0,
    b: 6356863.01877305,
    dX: 28,
    dY: -130,
    dZ: -95,
  },
];

/** WGS84 ellipsoid. */
const WGS84_A = 6378137.0;
const WGS84_B = 6356752.31424518;

export function geographicToECEF(
  lon: number,
  lat: number,
  a: number,
  b: number
): [number, number, number] {
  const toRad = Math.PI / 180;
  const φ = lat * toRad;
  const λ = lon * toRad;
  const e2 = 1 - (b * b) / (a * a);
  const N = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2);
  return [N * Math.cos(φ) * Math.cos(λ), N * Math.cos(φ) * Math.sin(λ), N * (1 - e2) * Math.sin(φ)];
}

export function ecefToGeographic(
  X: number,
  Y: number,
  Z: number,
  a: number,
  b: number
): [number, number] {
  const toDeg = 180 / Math.PI;
  const e2 = 1 - (b * b) / (a * a);
  const lon = Math.atan2(Y, X);
  const p = Math.sqrt(X * X + Y * Y);
  // Bowring iterative lat
  let lat = Math.atan2(Z, p * (1 - e2));
  for (let i = 0; i < 10; i++) {
    const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    lat = Math.atan2(Z + e2 * N * Math.sin(lat), p);
  }
  return [lon * toDeg, lat * toDeg];
}

/** Shifts one `[lon, lat]` pair from `preset`'s datum onto WGS84. */
export function shiftToWgs84(geo: [number, number], preset: DatumPreset): [number, number] {
  const [X, Y, Z] = geographicToECEF(geo[0], geo[1], preset.a, preset.b);
  const [lon, lat] = ecefToGeographic(
    X + preset.dX,
    Y + preset.dY,
    Z + preset.dZ,
    WGS84_A,
    WGS84_B
  );
  return [+lon.toFixed(8), +lat.toFixed(8)];
}
