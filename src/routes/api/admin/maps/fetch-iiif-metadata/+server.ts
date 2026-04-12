import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';
import { fetchIIIFManifest } from '$lib/maps/iiifManifest';

async function assertAdmin(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');

    const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') throw error(403, 'Forbidden');
}

/** POST — fetch and parse a IIIF manifest, return normalised metadata */
export const POST: RequestHandler = async ({ locals, request }) => {
    await assertAdmin(locals);

    const body = await request.json();
    const { manifestUrl } = body as { manifestUrl?: string };

    if (!manifestUrl) throw error(400, 'manifestUrl is required');

    const meta = await fetchIIIFManifest(manifestUrl);
    if (!meta) throw error(502, 'Failed to fetch or parse IIIF manifest');

    return json(meta);
};
