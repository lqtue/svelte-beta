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

/** PATCH — update a label task */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
    const adminSupabase = await getAdminClient(locals);
    const taskId = params.id;

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.status !== undefined) updateData.status = body.status;
    if (body.legend !== undefined) updateData.legend = body.legend;
    if (body.region !== undefined) updateData.region = body.region;

    const { data, error: dbError } = await adminSupabase
        .from('label_tasks')
        .update(updateData as never)
        .eq('id', taskId)
        .select()
        .single();

    if (dbError) throw error(500, dbError.message);
    return json(data);
};

/** DELETE — remove a label task (pins cascade) */
export const DELETE: RequestHandler = async ({ locals, params }) => {
    const adminSupabase = await getAdminClient(locals);
    const taskId = params.id;

    const { error: dbError } = await adminSupabase
        .from('label_tasks')
        .delete()
        .eq('id', taskId);

    if (dbError) throw error(500, dbError.message);
    return json({ success: true });
};
