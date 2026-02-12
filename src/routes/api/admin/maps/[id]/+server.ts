import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

async function getAdminClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');

    const adminSupabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: profile } = await adminSupabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') throw error(403, 'Forbidden');

    return adminSupabase;
}

/** PATCH — update map fields */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
    const adminSupabase = await getAdminClient(locals);
    const mapId = params.id;

    const body = await request.json();
    const updateData: Database['public']['Tables']['maps']['Update'] = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.allmaps_id !== undefined) updateData.allmaps_id = body.allmaps_id;
    if (body.type !== undefined) updateData.type = body.type || null;
    if (body.year !== undefined) updateData.year = body.year ? Number(body.year) : null;
    if (body.summary !== undefined) updateData.summary = body.summary || null;
    if (body.description !== undefined) updateData.description = body.description || null;
    if (body.is_featured !== undefined) updateData.is_featured = Boolean(body.is_featured);
    if (body.thumbnail !== undefined) updateData.thumbnail = body.thumbnail || null;

    const { data, error: dbError } = await adminSupabase
        .from('maps')
        .update(updateData)
        .eq('id', mapId)
        .select()
        .single();

    if (dbError) throw error(500, dbError.message);
    return json(data);
};

/** DELETE — remove a map */
export const DELETE: RequestHandler = async ({ locals, params }) => {
    const adminSupabase = await getAdminClient(locals);
    const mapId = params.id;

    const { error: dbError } = await adminSupabase
        .from('maps')
        .delete()
        .eq('id', mapId);

    if (dbError) throw error(500, dbError.message);
    return json({ success: true });
};
