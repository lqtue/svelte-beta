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

/** PATCH — update a source (e.g. set is_primary, change label) */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
    const supabase = await getAdminClient(locals);
    const body = await request.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};
    if (body.label        !== undefined) updateData.label        = body.label;
    if (body.source_type  !== undefined) updateData.source_type  = body.source_type;
    if (body.iiif_manifest !== undefined) updateData.iiif_manifest = body.iiif_manifest;
    if (body.iiif_image   !== undefined) updateData.iiif_image   = body.iiif_image;
    if (body.is_primary   !== undefined) updateData.is_primary   = body.is_primary;
    if (body.sort_order   !== undefined) updateData.sort_order   = body.sort_order;

    // Setting a new primary: clear the existing one first to avoid the partial
    // unique index violation on (map_id) WHERE is_primary = true.
    // The trigger would do this too, but it runs AFTER the constraint check.
    if (updateData.is_primary === true) {
        const { error: clearErr } = await (supabase as any)
            .from('map_iiif_sources')
            .update({ is_primary: false })
            .eq('map_id', params.id)
            .eq('is_primary', true)
            .neq('id', params.sourceId);
        if (clearErr) throw error(500, clearErr.message);
    }

    const { data, error: dbError } = await (supabase as any)
        .from('map_iiif_sources')
        .update(updateData)
        .eq('id', params.sourceId)
        .eq('map_id', params.id)
        .select()
        .single();

    if (dbError) throw error(500, dbError.message);
    return json(data);
};

/** DELETE — remove a source (cannot delete the only primary) */
export const DELETE: RequestHandler = async ({ locals, params }) => {
    const supabase = await getAdminClient(locals);

    // Guard: don't delete the primary if it's the only source
    const { data: sources } = await (supabase as any)
        .from('map_iiif_sources')
        .select('id, is_primary')
        .eq('map_id', params.id);

    const target = (sources as Array<{ id: string; is_primary: boolean }> | null)
        ?.find(s => s.id === params.sourceId);

    if (target?.is_primary && (sources?.length ?? 0) <= 1) {
        throw error(400, 'Cannot delete the only IIIF source for a map');
    }

    const { error: dbError } = await (supabase as any)
        .from('map_iiif_sources')
        .delete()
        .eq('id', params.sourceId)
        .eq('map_id', params.id);

    if (dbError) throw error(500, dbError.message);
    return json({ success: true });
};
