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

/**
 * Query the Allmaps Annotation Server to see if this manifest has already
 * been georeferenced. Returns the Allmaps image ID (used as allmaps_id) or null.
 *
 * Allmaps lookup endpoint: https://annotations.allmaps.org/?url={manifestUrl}
 * Returns a W3C annotation collection; items[0].id is the annotation URL whose
 * last path segment is the image ID stored in maps.allmaps_id.
 */
async function lookupAllmapsId(manifestUrl: string): Promise<string | null> {
    try {
        const lookupUrl = `https://annotations.allmaps.org/?url=${encodeURIComponent(manifestUrl)}`;
        const res = await fetch(lookupUrl, {
            headers: { Accept: 'application/json, application/ld+json' },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        // Response is a W3C AnnotationCollection or a single annotation.
        // Extract the image ID from the first item's id URL.
        const items: unknown[] = data?.items ?? (data?.id ? [data] : []);
        if (!items.length) return null;
        const firstItem = items[0] as Record<string, unknown>;
        // annotation id looks like https://annotations.allmaps.org/images/{id}
        const annotationId = firstItem?.id as string | undefined;
        if (!annotationId) return null;
        const match = annotationId.match(/\/images\/([^/]+)$/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

/** POST — fetch and parse a IIIF manifest, return normalised metadata + Allmaps check */
export const POST: RequestHandler = async ({ locals, request }) => {
    await assertAdmin(locals);

    const body = await request.json();
    const { manifestUrl } = body as { manifestUrl?: string };

    if (!manifestUrl) throw error(400, 'manifestUrl is required');

    const [meta, allmapsId] = await Promise.all([
        fetchIIIFManifest(manifestUrl),
        lookupAllmapsId(manifestUrl),
    ]);

    // Return whatever we got — partial results are fine, the form is always editable.
    // A null meta means the manifest was unreachable; return empty object so the
    // client knows the fetch ran but got nothing (vs. not calling at all).
    return json({ ...(meta ?? {}), allmapsId, fetchFailed: meta === null });
};
