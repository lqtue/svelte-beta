import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

// All fields a cataloger is allowed to edit.
// Excludes technical fields (source_type, allmaps_id, status, iiif_image, etc.)
const CATALOGER_FIELDS = new Set([
    // Classification
    'location',          // city / region
    'map_type',          // cartographic type (cadastral, topographic, etc.)
    // Core DC elements
    'original_title',    // dc:title
    'creator',           // dc:creator
    'dc_publisher',      // dc:publisher
    'year_label',        // dc:date
    'shelfmark',         // dc:identifier
    'source_url',        // dc:source
    'rights',            // dc:rights
    'dc_description',    // dc:description
    // Supplementary DC elements
    'dc_subject',        // dc:subject
    'dc_coverage',       // dc:coverage
    'language',          // dc:language
    'physical_description', // dc:format
    // VMA-specific
    'collection',
]);

async function getCatalogClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');

    const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    const role = (profile as any)?.role;
    if (role !== 'admin' && role !== 'mod') throw error(403, 'Forbidden');

    return supabase;
}

/** PATCH — update Dublin Core metadata fields on a map */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
    const supabase = await getCatalogClient(locals);
    const mapId = params.mapId;

    const body = await request.json();

    // Whitelist: only allow cataloger-safe fields
    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
        if (CATALOGER_FIELDS.has(key)) {
            update[key] = value === '' ? null : value;
        }
    }

    // extra_metadata handled separately — must be a flat object of string values
    if ('extra_metadata' in body) {
        const em = body.extra_metadata;
        if (em !== null && typeof em === 'object' && !Array.isArray(em)) {
            const clean: Record<string, string | null> = {};
            for (const [k, v] of Object.entries(em as Record<string, unknown>)) {
                if (k.trim()) clean[k.trim()] = typeof v === 'string' ? (v || null) : null;
            }
            update.extra_metadata = clean;
        } else if (em === null) {
            update.extra_metadata = {};
        }
    }

    if (Object.keys(update).length === 0) {
        throw error(400, 'No valid fields to update');
    }

    const { error: dbError } = await supabase
        .from('maps')
        .update(update as never)
        .eq('id', mapId);

    if (dbError) throw error(500, dbError.message);
    return json({ success: true });
};
