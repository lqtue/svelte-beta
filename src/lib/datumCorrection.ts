/**
 * Helmert 3-parameter geocentric datum transformation.
 * Converts geographic coordinates from a source datum to WGS84.
 *
 * towgs84 = (dX, dY, dZ) in metres: the translation to add to source ECEF
 * to obtain WGS84 ECEF (EPSG sign convention).
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
        // EPSG:3148 / EPSG:4131 — mainland South Vietnam, EPSG transform 1052.
        // US Army AMS / Series L7014, UTM Zone 48N.
        // Ellipsoid: Everest 1830 (1937 Adjustment) = PROJ evrst30, a=6377276.345
        // NOT Everest Modified (a=6377304.063, used for Malaysia) — common mistake.
        // towgs84=198,881,317 confirmed by EPSG:3148 proj4 and PROJ issue #1799.
        label: 'Indian 1960 — EPSG:4131 / EPSG:3148 · US Army AMS Vietnam (Everest 1830 1937 adj.)',
        a: 6377276.345, b: 6356075.41314024,
        dX: 198, dY: 881, dZ: 317,
    },
    {
        // EPSG:4131 / EPSG transform 1053 — Con Son Island variant
        // Same Everest 1830 (1937 Adjustment) ellipsoid as above.
        label: 'Indian 1960 — EPSG:4131 · Con Son Island variant',
        a: 6377276.345, b: 6356075.41314024,
        dX: 182, dY: 915, dZ: 344,
    },
    {
        // EPSG:4240 — Thailand / northern Indochina, Everest 1830 original
        label: 'Indian 1975 — EPSG:4240 (Thailand / northern Indochina, Everest 1830 orig.)',
        a: 6377276.345, b: 6356075.41314024,
        dX: 210, dY: 814, dZ: 289,
    },
    {
        // EPSG:4239 — alternative SE-Asia fit
        label: 'Indian 1954 — EPSG:4239 (alternative SE-Asia fit, Everest 1830 orig.)',
        a: 6377276.345, b: 6356075.41314024,
        dX: 217, dY: 823, dZ: 299,
    },
    {
        // Pulkovo 1942 — Soviet-era maps, Krassowsky ellipsoid
        label: 'Pulkovo 1942 / Gauss-Krüger (Soviet-era Vietnamese maps, Krassowsky)',
        a: 6378245.0, b: 6356863.01877305,
        dX: 28, dY: -130, dZ: -95,
    },
];

// WGS84 ellipsoid constants
const WGS84_A = 6378137.0;
const WGS84_B = 6356752.31424518;

function geographicToECEF(
    lon: number, lat: number,
    a: number, b: number,
): [number, number, number] {
    const toRad = Math.PI / 180;
    const φ = lat * toRad;
    const λ = lon * toRad;
    const e2 = 1 - (b * b) / (a * a);
    const N = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2);
    return [
        N * Math.cos(φ) * Math.cos(λ),
        N * Math.cos(φ) * Math.sin(λ),
        N * (1 - e2) * Math.sin(φ),
    ];
}

function ecefToGeographic(
    X: number, Y: number, Z: number,
    a: number, b: number,
): [number, number] {
    const toDeg = 180 / Math.PI;
    const e2 = 1 - (b * b) / (a * a);
    const lon = Math.atan2(Y, X);
    const p = Math.sqrt(X * X + Y * Y);
    // Bowring iterative latitude
    let lat = Math.atan2(Z, p * (1 - e2));
    for (let i = 0; i < 10; i++) {
        const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
        lat = Math.atan2(Z + e2 * N * Math.sin(lat), p);
    }
    return [lon * toDeg, lat * toDeg];
}

/**
 * Convert [lon, lat] from `preset` datum to WGS84.
 */
export function toWGS84(
    lon: number, lat: number,
    preset: DatumPreset,
): [number, number] {
    const [X, Y, Z] = geographicToECEF(lon, lat, preset.a, preset.b);
    const [wLon, wLat] = ecefToGeographic(
        X + preset.dX,
        Y + preset.dY,
        Z + preset.dZ,
        WGS84_A, WGS84_B,
    );
    return [+wLon.toFixed(8), +wLat.toFixed(8)];
}

/**
 * Apply datum correction to all GCPs in an Allmaps annotation object (mutates in place).
 * Returns the number of GCPs updated.
 */
export function applyDatumToAnnotation(annotation: any, preset: DatumPreset): number {
    let count = 0;
    for (const item of annotation.items ?? []) {
        for (const feature of item.body?.features ?? []) {
            const coords: [number, number] = feature.geometry?.coordinates;
            if (!coords || coords.length < 2) continue;
            const [lon, lat] = toWGS84(coords[0], coords[1], preset);
            feature.geometry.coordinates = [lon, lat];
            count++;
        }
    }
    return count;
}
