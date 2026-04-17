/**
 * POST /api/admin/maps/[id]/ocr/apply
 *
 * Reads ocr_extractions for a map (optionally filtered by run_id) and
 * inserts label_pins for extractions above the confidence threshold.
 *
 * Pixels: bbox center (global_x + global_w/2, global_y + global_h/2) in
 * source image space — same coordinate system label_pins uses.
 *
 * Body: { run_id?: string, min_confidence?: number (default 0.7) }
 * Response: { inserted: number, skipped: number, run_id: string }
 */

import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

async function getAdminClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');

    const adminSupabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: profile } = await (adminSupabase as any)
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if ((profile as any)?.role !== 'admin') throw error(403, 'Forbidden');

    return { adminSupabase, userId: user.id };
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
    const { adminSupabase, userId } = await getAdminClient(locals);
    const mapId = params.id;

    const body = await request.json().catch(() => ({}));
    const runId: string | null = body.run_id ?? null;
    const minConfidence: number = body.min_confidence ?? 0.7;

    // Fetch OCR extractions above threshold
    let query = (adminSupabase as any)
        .from('ocr_extractions')
        .select('id, run_id, category, text, confidence, global_x, global_y, global_w, global_h, rotation_deg, notes')
        .eq('map_id', mapId)
        .gte('confidence', minConfidence)
        .neq('category', 'other'); // skip bare parcel numbers

    if (runId) query = query.eq('run_id', runId);

    const { data: extractions, error: fetchError } = await query;
    if (fetchError) throw error(500, fetchError.message);
    if (!extractions || extractions.length === 0) {
        return json({ inserted: 0, skipped: 0, run_id: runId, message: 'No extractions found above threshold' });
    }

    // Check which extractions are already pinned (by ocr source + text + approx coords)
    // to avoid duplicate inserts on re-apply
    const { data: existing } = await (adminSupabase as any)
        .from('label_pins')
        .select('data')
        .eq('map_id', mapId)
        .not('data->source', 'is', null);

    const existingOcrIds = new Set<string>(
        ((existing ?? []) as any[])
            .map((p: any) => p.data?.ocr_extraction_id)
            .filter(Boolean)
    );

    // Build label_pins rows
    const toInsert = (extractions as any[])
        .filter((e: any) => !existingOcrIds.has(e.id))
        .filter((e: any) => e.global_x != null && e.global_y != null)
        .map((e: any) => ({
            map_id: mapId,
            user_id: userId,
            label: e.text,
            pixel_x: Math.round(e.global_x + (e.global_w ?? 0) / 2),
            pixel_y: Math.round(e.global_y + (e.global_h ?? 0) / 2),
            data: {
                source: 'ocr',
                ocr_extraction_id: e.id,
                run_id: e.run_id,
                category: e.category,
                confidence: e.confidence,
                rotation_deg: e.rotation_deg ?? null,
                notes: e.notes ?? null,
            },
        }));

    const skipped = extractions.length - toInsert.length;

    if (toInsert.length === 0) {
        return json({ inserted: 0, skipped, run_id: runId, message: 'All extractions already applied' });
    }

    const { error: insertError } = await (adminSupabase as any)
        .from('label_pins')
        .insert(toInsert);

    if (insertError) throw error(500, insertError.message);

    return json({ inserted: toInsert.length, skipped, run_id: runId });
};
