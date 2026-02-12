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

/** GET — list all label tasks with map name */
export const GET: RequestHandler = async ({ locals }) => {
    const adminSupabase = await getAdminClient(locals);

    const { data, error: dbError } = await adminSupabase
        .from('label_tasks')
        .select('*, maps(name)')
        .order('created_at', { ascending: false });

    if (dbError) throw error(500, dbError.message);
    return json(data);
};

/** POST — create a new label task */
export const POST: RequestHandler = async ({ locals, request }) => {
    const adminSupabase = await getAdminClient(locals);

    const body = await request.json();
    const { map_id, allmaps_id, region, legend } = body;

    if (!map_id || !allmaps_id) {
        throw error(400, 'map_id and allmaps_id are required');
    }

    const { data, error: dbError } = await adminSupabase
        .from('label_tasks')
        .insert({
            map_id,
            allmaps_id,
            region: region || {},
            legend: legend || [],
            status: 'open'
        } as never)
        .select()
        .single();

    if (dbError) throw error(500, dbError.message);
    return json(data, { status: 201 });
};
