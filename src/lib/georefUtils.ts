/**
 * Utilities for computing and propagating georeferencing data
 * across a regular map tile series (US Army AMS / UTM sheets).
 */

export interface CornerCoords {
    NW: [number, number]; // [lon, lat]
    NE: [number, number];
    SE: [number, number];
    SW: [number, number];
}

export interface PixelCorners {
    NW: [number, number]; // [x, y]
    NE: [number, number];
    SE: [number, number];
    SW: [number, number];
}

// ── SVG selector parsing ───────────────────────────────────────────────────

/**
 * Parse "<svg ...><polygon points="x1,y1 x2,y2 ..." /></svg>"
 * Returns the 4 corner pixel positions sorted into NW/NE/SE/SW.
 * (In image coords: y increases downward)
 */
export function parseSelectorCorners(svgValue: string): PixelCorners | null {
    const match = svgValue.match(/points=["']([^"']+)["']/);
    if (!match) return null;
    const pts = match[1].trim().split(/\s+/).map((p) => {
        const [x, y] = p.split(',').map(Number);
        return [x, y] as [number, number];
    });
    if (pts.length < 4) return null;

    // Sort by y (ascending = north), then x for tie-breaking
    const byY = [...pts].sort((a, b) => a[1] - b[1]);
    const top = byY.slice(0, 2).sort((a, b) => a[0] - b[0]); // NW, NE
    const bot = byY.slice(2).sort((a, b) => a[0] - b[0]);    // SW, SE

    return {
        NW: top[0], NE: top[1],
        SW: bot[0], SE: bot[1],
    };
}

// ── Affine (polynomial order 1) fitting ───────────────────────────────────

/**
 * Fit the affine model  f = c0 + c1*x + c2*y  to a set of (x,y)→f pairs.
 * Uses normal equations (least squares); works with ≥3 control points.
 */
function fitAffine(pts: { px: number; py: number; val: number }[]): [number, number, number] {
    // A^T A c = A^T b  where A rows = [1, px, py]
    let s1 = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    let sb = 0, sbx = 0, sby = 0;
    for (const { px, py, val } of pts) {
        s1 += 1; sx += px; sy += py;
        sxx += px * px; sxy += px * py; syy += py * py;
        sb += val; sbx += px * val; sby += py * val;
    }
    const ATA = [
        [s1,  sx,  sy ],
        [sx,  sxx, sxy],
        [sy,  sxy, syy],
    ];
    const ATb = [sb, sbx, sby];
    return solveLinear3(ATA, ATb);
}

/** Solve a 3×3 linear system Ax=b via Cramer's rule. */
function solveLinear3(A: number[][], b: number[]): [number, number, number] {
    const det3 = (m: number[][]): number =>
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
        m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
        m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

    const D = det3(A);
    const sub = (col: number): number[][] =>
        A.map((row, r) => row.map((v, c) => (c === col ? b[r] : v)));

    return [det3(sub(0)) / D, det3(sub(1)) / D, det3(sub(2)) / D];
}

/**
 * Apply affine coefficients to a pixel position.
 * f = c[0] + c[1]*px + c[2]*py
 */
function applyAffine(c: [number, number, number], px: number, py: number): number {
    return c[0] + c[1] * px + c[2] * py;
}

// ── Corner WGS84 from annotation ──────────────────────────────────────────

/**
 * Given an Allmaps annotation, compute the WGS84 coordinates of the 4
 * neatline corners using the polynomial-order-1 (affine) GCP fit.
 */
export function computeCornerCoords(annotation: any): CornerCoords | null {
    const item = annotation.items?.[0];
    if (!item) return null;

    const selectorValue: string = item.target?.selector?.value ?? '';
    const pixels = parseSelectorCorners(selectorValue);
    if (!pixels) return null;

    const features: any[] = item.body?.features ?? [];
    if (features.length < 3) return null;

    const gcps = features
        .map((f: any) => ({
            px: f.properties?.resourceCoords?.[0] as number,
            py: f.properties?.resourceCoords?.[1] as number,
            lon: f.geometry?.coordinates?.[0] as number,
            lat: f.geometry?.coordinates?.[1] as number,
        }))
        .filter((g) => g.px != null && g.py != null && g.lon != null && g.lat != null);

    if (gcps.length < 3) return null;

    const lonCoeffs = fitAffine(gcps.map((g) => ({ px: g.px, py: g.py, val: g.lon })));
    const latCoeffs = fitAffine(gcps.map((g) => ({ px: g.px, py: g.py, val: g.lat })));

    const project = ([px, py]: [number, number]): [number, number] => [
        +applyAffine(lonCoeffs, px, py).toFixed(8),
        +applyAffine(latCoeffs, px, py).toFixed(8),
    ];

    return {
        NW: project(pixels.NW),
        NE: project(pixels.NE),
        SE: project(pixels.SE),
        SW: project(pixels.SW),
    };
}

// ── Propagation ───────────────────────────────────────────────────────────

export type Direction = 'N' | 'S' | 'E' | 'W';

/**
 * Given the WGS84 corners of a reference map and the pixel corners of the
 * target map, compute the target's WGS84 corners based on adjacency direction.
 *
 * The reference map and target map share 2 corners depending on direction:
 *   E  → ref.NE→target.NW, ref.SE→target.SW; target.NE & SE extrapolated
 *   W  → ref.NW→target.NE, ref.SW→target.SE; target.NW & SW extrapolated
 *   N  → ref.NW→target.SW, ref.NE→target.SE; target.NW & NE extrapolated
 *   S  → ref.SW→target.NW, ref.SE→target.NE; target.SW & SE extrapolated
 *
 * Extrapolation uses the reference sheet dimensions (dLon, dLat).
 */
export function propagateCorners(
    refCorners: CornerCoords,
    direction: Direction,
): CornerCoords {
    // Sheet dimensions from reference
    const dLonEW = refCorners.NE[0] - refCorners.NW[0]; // eastern extent
    const dLatNS = refCorners.NW[1] - refCorners.SW[1]; // northern extent (positive)

    const add = (p: [number, number], dx: number, dy: number): [number, number] =>
        [+(p[0] + dx).toFixed(8), +(p[1] + dy).toFixed(8)];

    switch (direction) {
        case 'E': return {
            NW: refCorners.NE,
            SW: refCorners.SE,
            NE: add(refCorners.NE, dLonEW, 0),
            SE: add(refCorners.SE, dLonEW, 0),
        };
        case 'W': return {
            NE: refCorners.NW,
            SE: refCorners.SW,
            NW: add(refCorners.NW, -dLonEW, 0),
            SW: add(refCorners.SW, -dLonEW, 0),
        };
        case 'S': return {
            NW: refCorners.SW,
            NE: refCorners.SE,
            SW: add(refCorners.SW, 0, -dLatNS),
            SE: add(refCorners.SE, 0, -dLatNS),
        };
        case 'N': return {
            SW: refCorners.NW,
            SE: refCorners.NE,
            NW: add(refCorners.NW, 0, dLatNS),
            NE: add(refCorners.NE, 0, dLatNS),
        };
    }
}

/**
 * Build a new annotation body with 4 corner GCPs derived from targetCorners,
 * mapped to the target map's neatline corner pixels.
 * Preserves all other annotation fields (source, selector, _allmaps, etc.)
 */
export function buildCornerAnnotation(
    targetAnnotation: any,
    targetCorners: CornerCoords,
): any {
    const item = targetAnnotation.items?.[0];
    if (!item) throw new Error('No annotation item found');

    const pixels = parseSelectorCorners(item.target?.selector?.value ?? '');
    if (!pixels) throw new Error('Cannot parse neatline corners from selector');

    const CORNER_ORDER: (keyof PixelCorners)[] = ['NW', 'NE', 'SE', 'SW'];
    const features = CORNER_ORDER.map((corner) => ({
        type: 'Feature',
        properties: { resourceCoords: pixels[corner] },
        geometry: { type: 'Point', coordinates: targetCorners[corner] },
    }));

    const updated = JSON.parse(JSON.stringify(targetAnnotation));
    updated.items[0].body = {
        ...updated.items[0].body,
        type: 'FeatureCollection',
        transformation: { type: 'polynomial', options: { order: 1 } },
        features,
    };
    return updated;
}
