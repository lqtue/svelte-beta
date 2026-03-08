/**
 * Pure TypeScript MGRS → WGS84 conversion for Vietnam-region military grids.
 *
 * Coordinate system:
 *   MGRS uses the Indian 1960 datum (Everest 1830, 1937 Adjustment)
 *   with UTM zones 47, 48, 49 for Vietnam. After computing lat/lon in
 *   Indian 1960, we apply the Helmert shift to WGS84 via datumCorrection.ts.
 */

import { toWGS84, DATUM_PRESETS } from '$lib/datumCorrection';

// ── MGRS 100 km grid square letter tables ─────────────────────────────────
// Column (easting) letters: A–H, J–N, P–Z (I and O omitted)
// The column set cycles with zone parity:
//   odd zones  (47, 49, …): column set 1 → A B C D E F G H
//   even zones (48, 50, …): column set 2 → J K L M N P Q R S
//   (cycle repeats: set 3 → T U V W X Y Z — then repeats from A)
// Row (northing) letters cycle every 20 rows (A–H, J–N, P–V, then repeat)

const COL_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 24 letters (no I, O)

// Column letter sets per zone-parity (1-indexed mod 3)
// Zone mod 3 == 1 → set starting at A (index 0)
// Zone mod 3 == 2 → set starting at J (index 8, since A=0..H=7, J=8)
// Zone mod 3 == 0 → set starting at T (index 17)
const COL_SET_STARTS = [0, 8, 17]; // zone mod 3 → start index in COL_LETTERS

// Row letter sequence (A–H, J–N, P–V, repeat), 20 letters
const ROW_LETTERS = 'ABCDEFGHJKLMNPQRSTUV';

export interface ParsedMGRS {
    zone: number;       // UTM zone number (e.g. 48)
    band: string;       // Latitude band letter (e.g. 'P')
    sq100E: string;     // 100 km grid square easting letter
    sq100N: string;     // 100 km grid square northing letter
    easting: number;    // Numeric easting (metres within 100 km sq)
    northing: number;   // Numeric northing (metres within 100 km sq)
    precision: number;  // Digit pairs per component (1=10km, 5=1m)
}

/**
 * Parse a compact MGRS string (no spaces) into its components.
 * Returns null if the string is not valid MGRS format.
 */
export function parseMGRS(mgrs: string): ParsedMGRS | null {
    // Strip spaces
    const s = mgrs.replace(/\s+/g, '').toUpperCase();

    // Regex: zone (1-2 digits) + band + 2-letter 100km sq + 4-10 digits
    const m = s.match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d{4,10})$/i);
    if (!m) return null;

    const zone = parseInt(m[1], 10);
    const band = m[2];
    const sq100E = m[3][0];
    const sq100N = m[3][1];
    const digits = m[4];

    // Digits must be even (equal easting/northing pairs)
    if (digits.length % 2 !== 0) return null;

    const precision = digits.length / 2;
    const easting  = parseInt(digits.slice(0, precision), 10) * Math.pow(10, 5 - precision);
    const northing = parseInt(digits.slice(precision), 10)    * Math.pow(10, 5 - precision);

    return { zone, band, sq100E, sq100N, easting, northing, precision };
}

/**
 * Convert a ParsedMGRS to geographic coordinates in the Indian 1960 datum
 * (same as UTM with Everest ellipsoid, k0=0.9996).
 *
 * Returns [lon, lat] in degrees, Indian 1960.
 */
export function mgrsToIndian1960LatLon(p: ParsedMGRS): [number, number] {
    // ── Step 1: 100 km square letters → UTM easting/northing offsets ──────
    // Column letter → false easting offset (multiples of 100,000 m)
    const colSetIdx = ((p.zone - 1) % 3); // 0, 1, or 2
    const colStart = COL_SET_STARTS[colSetIdx];
    const colLetters = [];
    for (let i = 0; i < 8; i++) {
        colLetters.push(COL_LETTERS[(colStart + i) % COL_LETTERS.length]);
    }
    const colIdx = colLetters.indexOf(p.sq100E);
    if (colIdx < 0) throw new Error(`Invalid column letter: ${p.sq100E}`);
    // UTM false easting for zone = 500,000 m; col A of a zone starts at 100,000 m
    const e100km = (colIdx + 1) * 100_000;

    // Row letter → northing offset
    // Even zones shift row sequence by 5 (FGHJ...) to maintain interlocking
    const rowOffset = (p.zone % 2 === 0) ? 5 : 0;
    const rowIdx = (ROW_LETTERS.indexOf(p.sq100N) - rowOffset + ROW_LETTERS.length) % ROW_LETTERS.length;
    if (ROW_LETTERS.indexOf(p.sq100N) < 0) throw new Error(`Invalid row letter: ${p.sq100N}`);
    const n100km_base = rowIdx * 100_000; // 0 – 1,900,000

    // ── Step 2: full UTM easting ───────────────────────────────────────────
    const utmE = e100km + p.easting;

    // ── Step 3: UTM northing — find nearest 2 million m band ──────────────
    // Latitude band N (32.5°N) and bands within Vietnam are all north hemisphere
    const bandLat: Record<string, number> = {
        C: -72, D: -64, E: -56, F: -48, G: -40, H: -32,
        J: -24, K: -16, L: -8,  M: 0,
        N: 8,   P: 16,  Q: 24,  R: 32,  S: 40,  T: 48,
        U: 56,  V: 64,  W: 72,  X: 80,
    };
    const approxLat = (bandLat[p.band] ?? 0) + 4; // midpoint of 8° band
    const approxNorthing = approxLat >= 0
        ? approxLat * 110_574       // rough metres per degree latitude
        : approxLat * 110_574 + 10_000_000; // southern hemisphere

    // Snap n100km_base to closest 2,000,000 m cycle
    const cycles = Math.round((approxNorthing - n100km_base) / 2_000_000);
    const utmN = n100km_base + cycles * 2_000_000 + p.northing;

    // ── Step 4: TM inverse — UTM → lat/lon using Everest 1830 ellipsoid ───
    const a  = 6377276.345;
    const b  = 6356075.41314024;
    const k0 = 0.9996;
    const E0 = 500_000;
    const N0 = 0; // northern hemisphere

    const e2   = 1 - (b * b) / (a * a);
    const e4   = e2 * e2;
    const e6   = e4 * e2;
    const e1   = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

    const x = utmE - E0;
    const M = (utmN - N0) / k0;

    const mu = M / (a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));

    const phi1 = mu
        + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
        + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
        + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
        + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);

    const sinPhi1 = Math.sin(phi1);
    const cosPhi1 = Math.cos(phi1);
    const tanPhi1 = Math.tan(phi1);

    const ep2 = e2 / (1 - e2);
    const N1  = a / Math.sqrt(1 - e2 * sinPhi1 ** 2);
    const T1  = tanPhi1 ** 2;
    const C1  = ep2 * cosPhi1 ** 2;
    const R1  = a * (1 - e2) / (1 - e2 * sinPhi1 ** 2) ** 1.5;
    const D   = x / (N1 * k0);

    const lat = phi1
        - (N1 * tanPhi1 / R1) * (
            D ** 2 / 2
            - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
            + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720
        );

    const lon0 = ((p.zone - 1) * 6 - 180 + 3) * (Math.PI / 180); // central meridian in rad
    const lon = lon0 + (
        D
        - (1 + 2 * T1 + C1) * D ** 3 / 6
        + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120
    ) / cosPhi1;

    return [lon * 180 / Math.PI, lat * 180 / Math.PI];
}

/**
 * Convert a compact MGRS string to WGS84 [lon, lat].
 * Returns null if parsing or conversion fails.
 */
export function mgrsToWGS84(mgrs: string): [number, number] | null {
    try {
        const parsed = parseMGRS(mgrs);
        if (!parsed) return null;
        const [lon, lat] = mgrsToIndian1960LatLon(parsed);
        return toWGS84(lon, lat, DATUM_PRESETS[0]);
    } catch {
        return null;
    }
}

/**
 * Validate an MGRS string for the Vietnam region.
 * Requires: 10-digit precision, zones 47–49, bands N/P/Q.
 */
export function isValidMGRS(mgrs: string): boolean {
    const parsed = parseMGRS(mgrs);
    if (!parsed) return false;
    if (parsed.precision !== 5) return false; // must be 10 digits total
    if (parsed.zone < 47 || parsed.zone > 49) return false;
    if (!['N', 'P', 'Q'].includes(parsed.band)) return false;
    return true;
}
