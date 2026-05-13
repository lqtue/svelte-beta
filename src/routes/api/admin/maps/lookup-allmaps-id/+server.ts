import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';
import { generateId } from '@allmaps/id';

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

/**
 * POST { iiifImage } — given a IIIF image service URL, derive the Allmaps
 * image ID and confirm a georeferenced annotation exists on the Allmaps
 * annotation server. Returns { allmapsId, hasAnnotation }.
 *
 * Allmaps image IDs are the first 16 chars of the SHA-1 of the IIIF image
 * service URL (per @allmaps/id).
 */
export const POST: RequestHandler = async ({ locals, request }) => {
    await assertAdmin(locals);

    const { iiifImage } = (await request.json()) as { iiifImage?: string };
    if (!iiifImage) throw error(400, 'iiifImage is required');

    const trimmed = iiifImage.replace(/\/(info\.json|)$/, '').replace(/\/$/, '');

    let allmapsId: string;
    try {
        allmapsId = await generateId(trimmed);
    } catch (e: any) {
        throw error(500, `Could not derive Allmaps ID: ${e.message}`);
    }

    // Probe the annotation server to see if a georef exists.
    let hasAnnotation = false;
    try {
        const probe = await fetch(`https://annotations.allmaps.org/images/${allmapsId}`, {
            headers: { Accept: 'application/json, application/ld+json' },
            signal: AbortSignal.timeout(8000),
        });
        hasAnnotation = probe.ok;
    } catch {
        /* leave hasAnnotation=false */
    }

    return json({ allmapsId, hasAnnotation });
};
