import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

async function getAdminClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');

    const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') throw error(403, 'Forbidden');
    return supabase;
}

/** GET — list all IIIF sources for a map */
export const GET: RequestHandler = async ({ locals, params }) => {
    const supabase = await getAdminClient(locals);

    const { data, error: dbError } = await (supabase as any)
        .from('map_iiif_sources')
        .select('*')
        .eq('map_id', params.id)
        .order('sort_order');

    if (dbError) throw error(500, dbError.message);
    return json(data);
};

/** POST — add a IIIF source to a map */
export const POST: RequestHandler = async ({ locals, params, request }) => {
    const supabase = await getAdminClient(locals);
    const body = await request.json();

    const { label, source_type, iiif_manifest, iiif_image, is_primary, sort_order } = body;
    if (!iiif_image) throw error(400, 'iiif_image is required');

    // If making this primary, the DB trigger handles demoting others
    const { data, error: dbError } = await (supabase as any)
        .from('map_iiif_sources')
        .insert({
            map_id: params.id,
            label: label || null,
            source_type: source_type || null,
            iiif_manifest: iiif_manifest || null,
            iiif_image,
            is_primary: is_primary ?? false,
            sort_order: sort_order ?? 0,
        })
        .select()
        .single();

    if (dbError) throw error(500, dbError.message);
    return json(data, { status: 201 });
};
