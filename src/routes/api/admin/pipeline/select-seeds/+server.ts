/**
 * POST /api/admin/pipeline/select-seeds
 *
 * Marks ~10% of pipeline_sheets as seed maps, evenly distributed across the
 * grid. Seeds are the sheets that must be manually georeferenced before
 * propagation can fill in the rest.
 *
 * Idempotent: clears existing seed flags first, then re-selects.
 * Body: { fraction?: number }  — default 0.10
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

export const POST: RequestHandler = async ({ locals, request }) => {
    const db = await getAdminClient(locals);
    const body = await request.json().catch(() => ({}));
    const fraction: number = body.fraction ?? 0.10;

    // Fetch all sheets ordered by grid position
    const { data: sheets } = await db
        .from('pipeline_sheets')
        .select('id, grid_row, grid_col')
        .order('grid_row')
        .order('grid_col');

    if (!sheets || sheets.length === 0) {
        return json({ seeded: 0, total: 0 });
    }

    const total = sheets.length;
    const step = Math.max(1, Math.round(1 / fraction));

    // Select every Nth sheet — distributed evenly across sorted grid positions
    const seedIds = sheets
        .filter((_, i) => i % step === 0)
        .map((s) => s.id);

    // Clear existing seed flags
    await db.from('pipeline_sheets').update({ is_seed: false }).neq('id', '00000000-0000-0000-0000-000000000000');

    // Mark selected sheets as seeds
    // Update in batches to avoid URL length limits
    for (let i = 0; i < seedIds.length; i += 100) {
        await db
            .from('pipeline_sheets')
            .update({ is_seed: true })
            .in('id', seedIds.slice(i, i + 100));
    }

    return json({ seeded: seedIds.length, total, fraction });
};
