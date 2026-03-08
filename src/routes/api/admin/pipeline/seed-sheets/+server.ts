/**
 * GET /api/admin/pipeline/seed-sheets
 * Returns all sheets marked as seeds, with their georef status.
 */
import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

async function getAdminClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');
    const db = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: p } = await db.from('profiles').select('role').eq('id', user.id).single();
    if (p?.role !== 'admin') throw error(403, 'Forbidden');
    return db;
}

export const GET: RequestHandler = async ({ locals }) => {
    const db = await getAdminClient(locals);
    const { data } = await db
        .from('pipeline_sheets')
        .select('id, sheet_number, sheet_name, georef_status, annotation_url, map_id')
        .eq('is_seed', true)
        .order('grid_row')
        .order('grid_col');
    return json(data ?? []);
};
