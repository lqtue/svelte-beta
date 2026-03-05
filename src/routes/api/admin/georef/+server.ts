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

/**
 * POST — Create a georef submission from admin.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
    const adminSupabase = await getAdminClient(locals);

    const body = await request.json();
    const { iiif_url, name, description } = body as {
        iiif_url: string;
        name: string;
        description?: string;
    };

    if (!iiif_url?.trim() || !name?.trim()) {
        throw error(400, 'iiif_url and name are required');
    }

    const { data, error: dbError } = await adminSupabase
        .from('georef_submissions')
        .insert({
            iiif_url: iiif_url.trim(),
            name: name.trim(),
            description: description?.trim() || null
        })
        .select()
        .single();

    if (dbError) {
        console.error('Failed to create georef submission:', dbError);
        throw error(500, dbError.message);
    }

    return json(data);
};
