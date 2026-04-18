import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

async function getAdminClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');

    const adminSupabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: profile } = await adminSupabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    if ((profile as any)?.role !== 'admin') throw error(403, 'Forbidden');

    return { adminSupabase, userId: user.id };
}

/** GET /api/admin/maps/[id]/ocr-review/revert-recent
 *  Query items validated in the last N minutes to preview the rollback.
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
    const { adminSupabase, userId } = await getAdminClient(locals);
    const mapId = params.id;
    const windowMins = parseInt(url.searchParams.get('window') ?? '15');
    const threshold = new Date(Date.now() - windowMins * 60 * 1000).toISOString();

    const { data, error: err, count } = await (adminSupabase as any)
        .from('ocr_extractions')
        .select('id', { count: 'exact' })
        .eq('map_id', mapId)
        .eq('status', 'validated')
        .eq('validated_by', userId)
        .gt('validated_at', threshold);

    if (err) throw error(500, err.message);
    return json({ count: count ?? 0, threshold });
};

/** POST /api/admin/maps/[id]/ocr-review/revert-recent
 *  Actually revert items validated in the last N minutes for the current user.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
    const { adminSupabase, userId } = await getAdminClient(locals);
    const mapId = params.id;
    const body = await request.json().catch(() => ({}));
    const windowMins = body.windowMins ?? 15;
    const threshold = new Date(Date.now() - windowMins * 60 * 1000).toISOString();

    const { error: err, count } = await (adminSupabase as any)
        .from('ocr_extractions')
        .update({ status: 'pending', validated_at: null, validated_by: null })
        .eq('map_id', mapId)
        .eq('status', 'validated')
        .eq('validated_by', userId)
        .gt('validated_at', threshold);

    if (err) throw error(500, err.message);
    return json({ ok: true, count });
};
