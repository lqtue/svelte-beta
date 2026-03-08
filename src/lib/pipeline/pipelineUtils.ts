/**
 * Shared utilities for the map pipeline.
 */

import { DATUM_PRESETS, toWGS84 } from '$lib/datumCorrection';
import { parseSelectorCorners, type CornerCoords } from '$lib/georefUtils';

// Indian 1960 preset (index 0 in DATUM_PRESETS)
const IND60 = DATUM_PRESETS[0];

/** Convert Indian 1960 lat/lon to WGS84 */
export function ind60ToWGS84(lon: number, lat: number): [number, number] {
    return toWGS84(lon, lat, IND60);
}

/** Build an Allmaps annotation JSON from sheet corners and IIIF source. */
export function buildAnnotation(opts: {
    iiifBase: string;   // e.g. https://iiif.archive.org/iiif/3/item%2Ffile.jpg
    width: number;
    height: number;
    wgs84Corners: CornerCoords;
    sheetName?: string;
    /** SVG polygon points string from GeoPDF neatline (e.g. "225,344 6551,344 ...").
     *  If provided, used as the clip polygon instead of the full image rectangle.
     *  This masks out margins, legends, and borders when rendering adjacent maps. */
    neatlinePixels?: string | null;
}): object {
    const { iiifBase, width, height, wgs84Corners, neatlinePixels } = opts;
    const { NW, NE, SE, SW } = wgs84Corners;

    // Neatline polygon:
    // - If we have the real neatline from the GeoPDF, use it (clips margins/legends).
    // - Otherwise fall back to the full image rectangle.
    let svgPoints: string;
    let cornerPixels: [number, number][];

    if (neatlinePixels && neatlinePixels.trim()) {
        // Use the extracted neatline polygon directly
        svgPoints = neatlinePixels.trim();
        // Derive the 4 extreme pixel corners (NW/NE/SE/SW) from the neatline polygon
        // for use as GCPs: find the point closest to each image corner.
        const pts = neatlinePixels.trim().split(/\s+/).map((p) => {
            const [x, y] = p.split(',').map(Number);
            return [x, y] as [number, number];
        });
        const closest = (targetX: number, targetY: number): [number, number] =>
            pts.reduce((best, p) =>
                (Math.hypot(p[0] - targetX, p[1] - targetY) < Math.hypot(best[0] - targetX, best[1] - targetY))
                    ? p : best
            );
        cornerPixels = [
            closest(0, 0),          // NW
            closest(width, 0),      // NE
            closest(width, height), // SE
            closest(0, height),     // SW
        ];
    } else {
        // Full image rectangle fallback
        const poly: [number, number][] = [
            [0, 0], [width, 0], [width, height], [0, height],
        ];
        svgPoints = poly.map(([x, y]) => `${x},${y}`).join(' ');
        cornerPixels = [[0, 0], [width, 0], [width, height], [0, height]];
    }

    const cornerGeo: [number, number][] = [NW, NE, SE, SW];

    const features = cornerPixels.map(([px, py], i) => ({
        type: 'Feature',
        properties: { resourceCoords: [px, py] },
        geometry: { type: 'Point', coordinates: cornerGeo[i] },
    }));

    return {
        type: 'AnnotationPage',
        '@context': 'http://www.w3.org/ns/anno.jsonld',
        items: [{
            type: 'Annotation',
            '@context': [
                'http://iiif.io/api/extension/georef/1/context.json',
                'http://iiif.io/api/presentation/3/context.json',
            ],
            motivation: 'georeferencing',
            target: {
                type: 'SpecificResource',
                source: {
                    id: iiifBase,
                    type: 'ImageService3',
                    width,
                    height,
                },
                selector: {
                    type: 'SvgSelector',
                    value: `<svg width="${width}" height="${height}"><polygon points="${svgPoints}" /></svg>`,
                },
            },
            body: {
                type: 'FeatureCollection',
                transformation: { type: 'polynomial', options: { order: 1 } },
                features,
            },
        }],
    };
}

/** Build the VVA download URL for a sheet number. */
export function vvaUrl(sheetNumber: string): string {
    return `https://vva.vietnam.ttu.edu/images.php?img=/maps/Big/${sheetNumber}.jpg`;
}

/** Build IA S3 upload URL and IIIF base for a sheet. */
export function iaUrls(sheetNumber: string): {
    s3Put: string;
    identifier: string;
    filename: string;
    iiifBase: string;
} {
    const identifier = `vma-vietnam-${sheetNumber}`;
    const filename = `${sheetNumber}.jpg`;
    return {
        s3Put: `https://s3.us.archive.org/${identifier}/${filename}`,
        identifier,
        filename,
        iiifBase: `https://iiif.archive.org/iiif/3/${encodeURIComponent(identifier + '/' + filename)}`,
    };
}

/** Fetch IIIF info.json, retrying up to maxAttempts with delayMs between tries. */
export async function fetchIiifInfo(
    iiifBase: string,
    maxAttempts = 6,
    delayMs = 10_000,
): Promise<{ width: number; height: number } | null> {
    const infoUrl = `${iiifBase}/info.json`;
    for (let i = 0; i < maxAttempts; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
        try {
            const res = await fetch(infoUrl);
            if (res.ok) {
                const info = await res.json();
                if (info.width && info.height) {
                    return { width: info.width, height: info.height };
                }
            }
        } catch { /* retry */ }
    }
    return null;
}

/**
 * Parse the UT Austin Vietnam topo index HTML.
 * Returns an array of { sheetNumber, sheetName, swLat, swLon, neLat, neLon }.
 * Geographic bounds may be null if not present in the HTML.
 */
const UT_BASE = 'https://maps.lib.utexas.edu/maps/topo/vietnam';

export function parseUtAustinIndex(html: string): Array<{
    sheetNumber: string;
    sheetName: string;
    pdfUrl: string | null;
    swLat: number | null;
    swLon: number | null;
    neLat: number | null;
    neLon: number | null;
}> {
    const results: ReturnType<typeof parseUtAustinIndex> = [];

    // Pre-pass: build a map from sheet number → PDF URL by scanning all <a href="*.pdf"> links
    const pdfUrlMap = new Map<string, string>();
    const pdfLinkRegex = /href="([^"]*?(\d{4}(?:-(?:[1-4]|I{1,3}V?|VI{0,3}))?)[^"]*?\.pdf)"/gi;
    let pdfMatch: RegExpExecArray | null;
    while ((pdfMatch = pdfLinkRegex.exec(html)) !== null) {
        const href = pdfMatch[1];
        const sheetNum = pdfMatch[2];
        // Make absolute URL if needed
        const url = href.startsWith('http') ? href : `${UT_BASE}/${href.replace(/^.*\//, '')}`;
        if (!pdfUrlMap.has(sheetNum)) pdfUrlMap.set(sheetNum, url);
    }

    // Extract all table rows or links that contain sheet numbers
    // Sheet numbers match patterns like: 6431, 6431-1, 6431-I, 6329-IV etc.
    const sheetPattern = /\b(\d{4}(?:-(?:[1-4]|I{1,3}V?|VI{0,3}))?)\b/g;

    // Try to find rows in an HTML table
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').trim();

    // Coordinate patterns: degrees like 10°30'N or decimal 10.5°N
    const dmsPattern = /(\d+)[°º]\s*(\d+)?'?\s*([NS])\s+(\d+)[°º]\s*(\d+)?'?\s*([EW])/;
    const decPattern = /(\d+\.?\d*)\s*°?\s*([NS])[\s,]+(\d+\.?\d*)\s*°?\s*([EW])/;

    function parseDeg(d: string, m: string, hemi: string): number {
        const deg = parseFloat(d) + (parseFloat(m || '0') / 60);
        return hemi === 'S' || hemi === 'W' ? -deg : deg;
    }

    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
        const rowHtml = rowMatch[1];
        const cells: string[] = [];
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
            cells.push(stripTags(cellMatch[1]));
        }
        if (cells.length < 2) continue;

        // Find a cell that contains a sheet number
        let sheetNumber = '';
        let sheetName = '';
        let swLat: number | null = null;
        let swLon: number | null = null;
        let neLat: number | null = null;
        let neLon: number | null = null;

        for (let ci = 0; ci < cells.length; ci++) {
            const cell = cells[ci];
            const m = cell.match(/^(\d{4}(?:-(?:[1-4]|I{1,3}V?|VI{0,3}))?)\b/);
            if (m) {
                sheetNumber = m[1];
                // Adjacent cell is likely the name
                if (cells[ci + 1] && !/^\d/.test(cells[ci + 1])) {
                    sheetName = cells[ci + 1];
                }
                // Look for coordinate cells
                for (let cj = ci + 1; cj < cells.length; cj++) {
                    const dmsM = cells[cj].match(dmsPattern);
                    const decM = cells[cj].match(decPattern);
                    if (dmsM) {
                        const lat = parseDeg(dmsM[1], dmsM[2], dmsM[3]);
                        const lon = parseDeg(dmsM[4], dmsM[5], dmsM[6]);
                        if (swLat === null) { swLat = lat; swLon = lon; }
                        else { neLat = lat; neLon = lon; }
                    } else if (decM) {
                        const lat = parseFloat(decM[1]) * (decM[2] === 'S' ? -1 : 1);
                        const lon = parseFloat(decM[3]) * (decM[4] === 'W' ? -1 : 1);
                        if (swLat === null) { swLat = lat; swLon = lon; }
                        else { neLat = lat; neLon = lon; }
                    }
                }
                break;
            }
        }

        if (sheetNumber) {
            results.push({ sheetNumber, sheetName, pdfUrl: pdfUrlMap.get(sheetNumber) ?? null, swLat, swLon, neLat, neLon });
        }
    }

    // Fallback: scan for any sheet-number-like links if table parsing found nothing
    if (results.length === 0) {
        const linkRegex = /href="[^"]*?(\d{4}(?:-(?:[1-4]|I{1,3}V?|VI{0,3}))?)[^"]*?\.(?:jpg|tif|pdf)"[^>]*>([\s\S]*?)<\/a>/gi;
        let lm: RegExpExecArray | null;
        while ((lm = linkRegex.exec(html)) !== null) {
            const sheetNumber = lm[1];
            results.push({
                sheetNumber,
                sheetName: stripTags(lm[2]).trim(),
                pdfUrl: pdfUrlMap.get(sheetNumber) ?? null,
                swLat: null, swLon: null, neLat: null, neLon: null,
            });
        }
    }

    return results;
}

/**
 * Assign grid positions to sheets based on sheet number patterns.
 * Sheets like 6431-3 encode row/col: first two digits = row, last two = col.
 * Quadrants 1-4 are sub-cells.
 */
export function assignGridPositions(sheets: Array<{ sheetNumber: string }>): Array<{ gridRow: number; gridCol: number }> {
    // Normalise sheet numbers: strip quadrant, get base
    return sheets.map(({ sheetNumber }) => {
        const [base, quad] = sheetNumber.split('-');
        const num = parseInt(base, 10);
        // Heuristic: hundreds digit = row offset, tens+units = col offset
        const row = Math.floor(num / 100) * 4 + (quad ? parseInt(quad, 10) - 1 : 0);
        const col = (num % 100) * 4 + (quad ? parseInt(quad, 10) - 1 : 0);
        return { gridRow: row, gridCol: col };
    });
}

/**
 * Select seed sheet IDs: choose every Nth sheet spread across the grid,
 * targeting ~seedFraction of total.
 */
export function selectSeedIndices(total: number, seedFraction = 0.1): number[] {
    const step = Math.round(1 / seedFraction);
    const seeds: number[] = [];
    for (let i = 0; i < total; i += step) seeds.push(i);
    return seeds;
}
