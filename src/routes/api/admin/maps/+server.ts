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

/** GET — list all maps (raw DB rows) */
export const GET: RequestHandler = async ({ locals }) => {
    const adminSupabase = await getAdminClient(locals);

    const { data, error: dbError } = await adminSupabase
        .from('maps')
        .select('*')
        .order('name');

    if (dbError) throw error(500, dbError.message);
    return json(data);
};

/** POST — create a new map */
export const POST: RequestHandler = async ({ locals, request }) => {
    const adminSupabase = await getAdminClient(locals);

    const body = await request.json();
    const {
        name, allmaps_id, location, year, dc_description, is_featured,
        // source / IIIF
        source_type, iiif_manifest, iiif_image, ia_identifier,
        original_title, creator, year_label, language, rights, source_url,
        shelfmark, physical_description, dc_publisher, dc_subject, dc_coverage,
        holding_institution,
        collection, map_type, bbox, status, extra_metadata,
        thumbnail,
        // contribution flags
        georef_done,
    } = body;

    if (!name) throw error(400, 'name is required');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertData: Record<string, any> = {
        name,
        allmaps_id: allmaps_id || null,
        location: location || null,
        year: year ? Number(year) : null,
        dc_description: dc_description || null,
        is_featured: is_featured || false,
    };
    if (source_type    !== undefined) insertData.source_type    = source_type;
    if (iiif_manifest  !== undefined) insertData.iiif_manifest  = iiif_manifest;
    if (iiif_image     !== undefined) insertData.iiif_image     = iiif_image;
    if (ia_identifier  !== undefined) insertData.ia_identifier  = ia_identifier;
    if (original_title !== undefined) insertData.original_title = original_title;
    if (creator        !== undefined) insertData.creator        = creator;
    if (year_label     !== undefined) insertData.year_label     = year_label;
    if (language       !== undefined) insertData.language       = language;
    if (rights         !== undefined) insertData.rights         = rights;
    if (source_url     !== undefined) insertData.source_url     = source_url;
    if (shelfmark      !== undefined) insertData.shelfmark      = shelfmark;
    if (physical_description !== undefined) insertData.physical_description = physical_description;
    if (dc_publisher   !== undefined) insertData.dc_publisher   = dc_publisher;
    if (dc_subject     !== undefined) insertData.dc_subject     = dc_subject;
    if (dc_coverage    !== undefined) insertData.dc_coverage    = dc_coverage;
    if (holding_institution !== undefined) insertData.holding_institution = holding_institution;
    if (collection     !== undefined) insertData.collection     = collection;
    if (map_type        !== undefined) insertData.map_type        = map_type;
    if (bbox            !== undefined) insertData.bbox            = bbox;
    if (status          !== undefined) insertData.status          = status;
    if (extra_metadata  !== undefined) insertData.extra_metadata  = extra_metadata;
    if (thumbnail       !== undefined) insertData.thumbnail       = thumbnail;
    if (georef_done     !== undefined) insertData.georef_done     = georef_done;

    const { data, error: dbError } = await (adminSupabase as any)
        .from('maps')
        .insert(insertData)
        .select()
        .single();

    if (dbError) throw error(500, dbError.message);
    return json(data, { status: 201 });
};
