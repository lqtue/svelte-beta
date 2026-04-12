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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};

    if (body.name          !== undefined) updateData.name          = body.name;
    if (body.allmaps_id    !== undefined) updateData.allmaps_id    = body.allmaps_id;
    if (body.location      !== undefined) updateData.location      = body.location || null;
    if (body.year          !== undefined) updateData.year          = body.year ? Number(body.year) : null;
    if (body.dc_description !== undefined) updateData.dc_description = body.dc_description || null;
    if (body.is_featured   !== undefined) updateData.is_featured   = Boolean(body.is_featured);
    if (body.thumbnail     !== undefined) updateData.thumbnail     = body.thumbnail || null;
    // new fields
    if (body.source_type    !== undefined) updateData.source_type    = body.source_type;
    if (body.iiif_manifest  !== undefined) updateData.iiif_manifest  = body.iiif_manifest || null;
    if (body.iiif_image     !== undefined) updateData.iiif_image     = body.iiif_image || null;
    if (body.ia_identifier  !== undefined) updateData.ia_identifier  = body.ia_identifier || null;
    if (body.original_title !== undefined) updateData.original_title = body.original_title || null;
    if (body.creator        !== undefined) updateData.creator        = body.creator || null;
    if (body.year_label     !== undefined) updateData.year_label     = body.year_label || null;
    if (body.language       !== undefined) updateData.language       = body.language || null;
    if (body.rights         !== undefined) updateData.rights         = body.rights || null;
    if (body.source_url     !== undefined) updateData.source_url     = body.source_url || null;
    if (body.collection     !== undefined) updateData.collection     = body.collection || null;
    if (body.map_type        !== undefined) updateData.map_type        = body.map_type || null;
    if (body.bbox            !== undefined) updateData.bbox            = body.bbox || null;
    if (body.status          !== undefined) updateData.status          = body.status;
    if (body.extra_metadata  !== undefined) {
        // Validate it's a flat object of strings
        if (typeof body.extra_metadata === 'object' && !Array.isArray(body.extra_metadata)) {
            updateData.extra_metadata = body.extra_metadata;
        }
    }
    if (body.label_config !== undefined) updateData.label_config = body.label_config;
    if (body.priority     !== undefined) updateData.priority     = Number(body.priority) || 0;
    if (body.is_public    !== undefined) updateData.is_public    = Boolean(body.is_public);
    if (body.georef_done  !== undefined) updateData.georef_done  = Boolean(body.georef_done);

    const { data, error: dbError } = await (adminSupabase as any)
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
