/**
 * POST /api/admin/pipeline/index-sheets
 *
 * action = 'scrape'  — fetch UT Austin index HTML server-side, parse, insert pipeline_sheets rows
 * action = 'import'  — accept sheets[] in request body (CSV import fallback)
 * action = 'clear'   — delete all pipeline_sheets (for reset)
 */
import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import { parseUtAustinIndex, vvaUrl } from '$lib/pipeline/pipelineUtils';

const UT_INDEX_URL = 'https://maps.lib.utexas.edu/maps/topo/vietnam/vietnam_index.html';

async function getAdminClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');
    const db = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: p } = await db.from('profiles').select('role').eq('id', user.id).single();
    if (p?.role !== 'admin') throw error(403, 'Forbidden');
    return db;
}

export const POST: RequestHandler = async ({ locals, request }) => {
    const db = await getAdminClient(locals);
    const body = await request.json();
    const action: string = body.action;

    if (action === 'clear') {
        await db.from('pipeline_sheets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        return json({ cleared: true });
    }

    let sheets: Array<{
        sheetNumber: string;
        sheetName: string;
        pdfUrl: string | null;
        swLat: number | null;  // Indian 1960
        swLon: number | null;
        neLat: number | null;
        neLon: number | null;
        wgs84SwLat: number | null;  // WGS84 (from GDAL extraction)
        wgs84SwLon: number | null;
        wgs84NeLat: number | null;
        wgs84NeLon: number | null;
        neatlinePixels: string | null;  // SVG polygon points from GeoPDF NEATLINE
    }> = [];

    if (action === 'scrape') {
        // Try fetching UT Austin index with browser-like headers
        const res = await fetch(UT_INDEX_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml',
                Referer: 'https://maps.lib.utexas.edu/maps/topo/vietnam/',
            },
        });
        if (!res.ok) throw error(502, `UT Austin returned ${res.status} — use the CSV import fallback`);
        const html = await res.text();
        sheets = parseUtAustinIndex(html).map((s) => ({
            ...s,
            wgs84SwLat: null, wgs84SwLon: null, wgs84NeLat: null, wgs84NeLon: null,
            neatlinePixels: null,
        }));
        if (sheets.length === 0) throw error(422, 'Could not parse any sheets from the index page — use CSV import');

    } else if (action === 'import') {
        // Caller provides sheets array directly (from CSV paste)
        // Each item: { sheetNumber, sheetName?, swLat?, swLon?, neLat?, neLon? }
        sheets = (body.sheets ?? []).map((s: any) => ({
            sheetNumber: String(s.sheetNumber ?? s.sheet_number ?? '').trim(),
            sheetName: String(s.sheetName ?? s.sheet_name ?? s.name ?? '').trim(),
            pdfUrl: s.pdfUrl ?? s.pdf_url ?? s.ut_pdf_url ?? null,
            swLat: s.swLat ?? s.sw_lat ?? null,
            swLon: s.swLon ?? s.sw_lon ?? null,
            neLat: s.neLat ?? s.ne_lat ?? null,
            neLon: s.neLon ?? s.ne_lon ?? null,
            wgs84SwLat: s.wgs84SwLat ?? s.wgs84_sw_lat ?? null,
            wgs84SwLon: s.wgs84SwLon ?? s.wgs84_sw_lon ?? null,
            wgs84NeLat: s.wgs84NeLat ?? s.wgs84_ne_lat ?? null,
            wgs84NeLon: s.wgs84NeLon ?? s.wgs84_ne_lon ?? null,
            neatlinePixels: s.neatlinePixels ?? s.neatline_pixels ?? null,
        })).filter((s: any) => s.sheetNumber);
    } else {
        throw error(400, `Unknown action: ${action}`);
    }

    // Sort sheets by number for deterministic grid assignment
    sheets.sort((a, b) => a.sheetNumber.localeCompare(b.sheetNumber, undefined, { numeric: true }));

    // Assign grid positions: index within the sorted list, then derive row/col
    // Group by base sheet number (e.g. 6431), within each base use quadrant for col/row
    const baseGroups = new Map<string, typeof sheets>();
    for (const s of sheets) {
        const base = s.sheetNumber.split('-')[0];
        if (!baseGroups.has(base)) baseGroups.set(base, []);
        baseGroups.get(base)!.push(s);
    }
    const sortedBases = [...baseGroups.keys()].sort((a, b) => parseInt(a) - parseInt(b));
    // Lay out: base row = index of base in sortedBases, quad col = quadrant (1-4)
    const gridPos = new Map<string, { gridRow: number; gridCol: number }>();
    sortedBases.forEach((base, bi) => {
        const group = baseGroups.get(base)!;
        group.forEach((s) => {
            const quad = parseInt(s.sheetNumber.split('-')[1] ?? '1') - 1;
            // base row*4 + quad offsets give a tight grid
            gridPos.set(s.sheetNumber, { gridRow: bi, gridCol: quad });
        });
    });

    // Upsert all sheets
    const rows = sheets.map((s) => ({
        series: 'L7014-Vietnam',
        sheet_number: s.sheetNumber,
        sheet_name: s.sheetName || null,
        source_url: vvaUrl(s.sheetNumber),
        ut_pdf_url: s.pdfUrl ?? null,
        grid_row: gridPos.get(s.sheetNumber)?.gridRow ?? 0,
        grid_col: gridPos.get(s.sheetNumber)?.gridCol ?? 0,
        ind60_sw_lat: s.swLat,
        ind60_sw_lon: s.swLon,
        ind60_ne_lat: s.neLat,
        ind60_ne_lon: s.neLon,
        // WGS84 corners + neatline from GDAL — only set if provided (via CSV import)
        ...(s.wgs84SwLat != null && {
            wgs84_sw_lat: s.wgs84SwLat,
            wgs84_sw_lon: s.wgs84SwLon,
            wgs84_ne_lat: s.wgs84NeLat,
            wgs84_ne_lon: s.wgs84NeLon,
            neatline_pixels: s.neatlinePixels || null,
            pdf_status: 'done',
        }),
    }));

    // Upsert in batches of 100
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 100) {
        const { error: e } = await db
            .from('pipeline_sheets')
            .upsert(rows.slice(i, i + 100), { onConflict: 'series,sheet_number' });
        if (e) throw error(500, e.message);
        inserted += Math.min(100, rows.length - i);
    }

    return json({ inserted, total: sheets.length });
};
