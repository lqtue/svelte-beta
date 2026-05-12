import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';
import { fetchIIIFManifest } from '$lib/maps/iiifManifest';
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
 * Query the Allmaps Annotation Server to see if this manifest has already
 * been georeferenced. Returns the Allmaps image ID (used as allmaps_id) or null.
 *
 * Allmaps lookup endpoint: https://annotations.allmaps.org/?url={manifestUrl}
 * Returns a W3C annotation collection; items[0].id is the annotation URL whose
 * last path segment is the image ID stored in maps.allmaps_id.
 */
/**
 * Allmaps image IDs are the first 16 chars of the SHA-1 of the IIIF image
 * service URL (per @allmaps/id). Compute it locally, then check the annotation
 * server to confirm the map has been georeferenced. Returns the imageId if a
 * georeferenced annotation exists, otherwise null.
 */
async function lookupAllmapsId(manifestUrl: string, imageServiceUrl?: string): Promise<string | null> {
    // Strategy 1: compute imageId from the IIIF image service URL and probe
    // the image-level annotation endpoint. This is the canonical lookup.
    if (imageServiceUrl) {
        try {
            const imageId = await generateId(imageServiceUrl.replace(/\/$/, ''));
            const probe = await fetch(`https://annotations.allmaps.org/images/${imageId}`, {
                headers: { Accept: 'application/json, application/ld+json' },
                signal: AbortSignal.timeout(8000),
            });
            if (probe.ok) return imageId;
        } catch {
            /* fall through */
        }
    }

    // Strategy 2: fall back to the manifest-scoped lookup. Newer Allmaps
    // annotations expose `id` as `/maps/<mapId>` — extract the image URL
    // from `target.source.id` and hash it.
    try {
        const res = await fetch(`https://annotations.allmaps.org/?url=${encodeURIComponent(manifestUrl)}`, {
            headers: { Accept: 'application/json, application/ld+json' },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const items: unknown[] = data?.items ?? (data?.id ? [data] : []);
        if (!items.length) return null;
        const firstItem = items[0] as Record<string, any>;

        // Legacy: id may already be /images/<imageId>
        const idMatch = (firstItem?.id as string | undefined)?.match(/\/images\/([^/]+)$/);
        if (idMatch) return idMatch[1];

        // Modern: derive imageId from target.source.id
        const target = Array.isArray(firstItem?.target) ? firstItem.target[0] : firstItem?.target;
        const sourceId =
            (typeof target?.source === 'string' ? target.source : target?.source?.id) ??
            target?.source?.['@id'];
        if (typeof sourceId === 'string' && sourceId) {
            return await generateId(sourceId.replace(/\/$/, ''));
        }
        return null;
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

    // Fetch manifest first so we can pass the image service URL to the
    // Allmaps lookup (it's the canonical key — the manifest URL alone may not
    // resolve on the annotation server).
    const meta = await fetchIIIFManifest(manifestUrl);
    const allmapsId = await lookupAllmapsId(manifestUrl, meta?.imageServiceUrl);

    return json({ ...(meta ?? {}), allmapsId, fetchFailed: meta === null });
};
