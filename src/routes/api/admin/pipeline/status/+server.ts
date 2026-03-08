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

/** GET — pipeline overview counts per stage */
export const GET: RequestHandler = async ({ locals }) => {
    const db = await getAdminClient(locals);

    const { data: rows } = await db
        .from('pipeline_sheets')
        .select('ia_status, annotation_status, georef_status, is_seed');

    if (!rows) return json({ total: 0 });

    const total = rows.length;
    const ia = { pending: 0, uploading: 0, done: 0, error: 0, skip: 0 };
    const ann = { pending: 0, iiif_wait: 0, done: 0, error: 0 };
    const geo = { pending: 0, seed_ready: 0, seed_done: 0, propagated: 0, error: 0 };
    let seeds = 0;

    for (const r of rows) {
        (ia as any)[r.ia_status]++;
        (ann as any)[r.annotation_status]++;
        (geo as any)[r.georef_status]++;
        if (r.is_seed) seeds++;
    }

    return json({ total, ia, ann, geo, seeds });
};
