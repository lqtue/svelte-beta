/**
 * POST /api/admin/pipeline/propagate-sheet
 * Body: { sheetId?: string }  — if omitted, picks next propagatable sheet
 *
 * BFS propagation: finds a sheet whose grid-adjacent neighbour has
 * georef_status='done', computes its corners from the neighbour's annotation,
 * writes 4-GCP annotation to Supabase Storage, updates maps row, and marks
 * georef_status='propagated'.
 *
 * Seeds (is_seed=true) are skipped — those require manual georef.
 */
import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import { computeCornerCoords, propagateCorners, buildCornerAnnotation } from '$lib/georefUtils';
import type { Direction } from '$lib/georefUtils';

const ANNOTATION_BUCKET = 'annotations';

async function getAdminClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');
    const db = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: p } = await db.from('profiles').select('role').eq('id', user.id).single();
    if (p?.role !== 'admin') throw error(403, 'Forbidden');
    return db;
}

async function fetchAnnotation(url: string): Promise<any> {
    const bust = `${url.split('?')[0]}?_t=${Date.now()}`;
    const res = await fetch(bust, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Fetch annotation failed: ${res.status}`);
    return res.json();
}

async function uploadAnnotation(filePath: string, content: string): Promise<string> {
    const res = await fetch(
        `${PUBLIC_SUPABASE_URL}/storage/v1/object/${ANNOTATION_BUCKET}/${filePath}`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
                'x-upsert': 'true',
                'Cache-Control': 'no-cache',
            },
            body: content,
        },
    );
    if (!res.ok) {
        const msg = await res.text().catch(() => String(res.status));
        throw new Error(`Storage upload failed (${res.status}): ${msg}`);
    }
    return `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${ANNOTATION_BUCKET}/${filePath}`;
}

/** Return the direction from `neighbour` to `target` based on grid position. */
function directionTo(
    neighbour: { grid_row: number; grid_col: number },
    target: { grid_row: number; grid_col: number },
): Direction | null {
    const dr = target.grid_row - neighbour.grid_row;
    const dc = target.grid_col - neighbour.grid_col;
    if (dr === 0 && dc === 1) return 'E';
    if (dr === 0 && dc === -1) return 'W';
    if (dr === -1 && dc === 0) return 'N';
    if (dr === 1 && dc === 0) return 'S';
    return null; // diagonal or non-adjacent — skip
}

export const POST: RequestHandler = async ({ locals, request }) => {
    const db = await getAdminClient(locals);
    const body = await request.json().catch(() => ({}));

    // Fetch all done sheets (seeds or manually georef'd) once — we'll use them to find neighbours
    const { data: doneSheetsRaw } = await db
        .from('pipeline_sheets')
        .select('id, grid_row, grid_col, annotation_url')
        .eq('annotation_status', 'done')
        .in('georef_status', ['seed_done', 'propagated']);

    const doneSheets = doneSheetsRaw ?? [];
    const doneByGrid = new Map<string, typeof doneSheets[0]>();
    for (const s of doneSheets) {
        doneByGrid.set(`${s.grid_row},${s.grid_col}`, s);
    }

    // Pick target sheet
    let target: any;
    if (body.sheetId) {
        const { data } = await db.from('pipeline_sheets').select('*').eq('id', body.sheetId).single();
        target = data;
    } else {
        // Find any sheet with annotation_status='done' and georef_status='pending', not a seed,
        // that has at least one done neighbour
        const { data: candidates } = await db
            .from('pipeline_sheets')
            .select('*')
            .eq('annotation_status', 'done')
            .eq('georef_status', 'pending')
            .eq('is_seed', false)
            .order('grid_row')
            .order('grid_col');

        if (!candidates || candidates.length === 0) {
            return json({ done: true, message: 'No sheets ready for propagation' });
        }

        // Pick first candidate that has a done neighbour
        const DIRS: [number, number][] = [[0, 1], [0, -1], [-1, 0], [1, 0]];
        for (const c of candidates) {
            const hasNeighbour = DIRS.some(([dr, dc]) =>
                doneByGrid.has(`${c.grid_row + dr},${c.grid_col + dc}`)
            );
            if (hasNeighbour) { target = c; break; }
        }
        if (!target) {
            return json({ done: false, waiting: true, message: 'No propagatable sheets found — waiting for manual seeds' });
        }
    }

    if (!target) return json({ done: true, message: 'Sheet not found' });
    if (!target.annotation_url) {
        return json({ success: false, error: 'Target has no annotation URL — run annotate first' });
    }

    // Find a done neighbour
    const DIRS: [number, number][] = [[0, 1], [0, -1], [-1, 0], [1, 0]];
    let neighbour: typeof doneSheets[0] | null = null;
    let direction: Direction | null = null;

    for (const [dr, dc] of DIRS) {
        const key = `${target.grid_row + dr},${target.grid_col + dc}`;
        const n = doneByGrid.get(key);
        if (n?.annotation_url) {
            const d = directionTo(n, target);
            if (d) { neighbour = n; direction = d; break; }
        }
    }

    if (!neighbour || !direction) {
        return json({ success: false, waiting: true, message: 'No georef\'d neighbour found yet' });
    }

    try {
        // Fetch both annotations
        const [refAnnotation, targetAnnotation] = await Promise.all([
            fetchAnnotation(neighbour.annotation_url),
            fetchAnnotation(target.annotation_url),
        ]);

        // Compute reference corners
        const refCorners = computeCornerCoords(refAnnotation);
        if (!refCorners) throw new Error('Could not compute corners from reference annotation');

        // Propagate to target
        const targetCorners = propagateCorners(refCorners, direction);

        // Build updated annotation with 4 corner GCPs
        const updatedAnnotation = buildCornerAnnotation(targetAnnotation, targetCorners);
        const annotationJson = JSON.stringify(updatedAnnotation, null, 2);

        const filePath = `pipeline/${target.series}/${target.sheet_number}.json`;
        const annotationUrl = await uploadAnnotation(filePath, annotationJson);

        // Update maps row
        let mapId = target.map_id;
        if (mapId) {
            await db.from('maps').update({ allmaps_id: annotationUrl }).eq('id', mapId);
        } else {
            const { data: mapRow } = await db.from('maps').insert({
                name: target.sheet_name || target.sheet_number,
                allmaps_id: annotationUrl,
                type: 'Vietnam',
                year: 1970,
            }).select('id').single();
            mapId = mapRow?.id ?? null;
        }

        await db.from('pipeline_sheets').update({
            georef_status: 'propagated',
            georef_source_id: neighbour.id,
            annotation_url: annotationUrl,
            map_id: mapId,
            updated_at: new Date().toISOString(),
        }).eq('id', target.id);

        return json({
            success: true,
            sheetNumber: target.sheet_number,
            direction,
            refSheet: neighbour.id,
            annotationUrl,
            mapId,
        });

    } catch (e: any) {
        await db.from('pipeline_sheets').update({
            georef_status: 'error',
            updated_at: new Date().toISOString(),
        }).eq('id', target.id);
        return json({ success: false, error: e.message });
    }
};
