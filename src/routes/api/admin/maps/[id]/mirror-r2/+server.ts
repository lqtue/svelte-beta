import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

const R2_BASE = 'https://iiif.maparchive.vn/iiif';
const ANNOTATIONS_BUCKET = 'annotations';

async function getAdminClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');

    const adminSupabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: profile } = await adminSupabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    if ((profile as any)?.role !== 'admin') throw error(403, 'Forbidden');

    return adminSupabase;
}

/**
 * Walks an Allmaps annotation (single Annotation or AnnotationCollection)
 * and returns the first IIIF image service URL found in the target source.
 */
function extractSourceUrl(annotation: any): string | null {
    const items: any[] =
        annotation.type === 'Annotation'
            ? [annotation]
            : (annotation.items ?? annotation.maps ?? []);

    for (const item of items) {
        const target = item.target;
        if (!target) continue;
        const source = typeof target === 'string' ? target : (target.source ?? target);
        const id = typeof source === 'string' ? source : source?.id;
        if (id && typeof id === 'string' && id.startsWith('http')) return id;
    }
    return null;
}

/**
 * Replaces all occurrences of oldUrl with newUrl throughout the annotation JSON.
 * Handles both slashed and non-slashed versions to be thorough.
 */
function rewriteSourceUrl(annotation: any, oldUrl: string, newUrl: string): any {
    const raw = JSON.stringify(annotation);
    const oldBase = oldUrl.replace(/\/+$/, '');
    const newBase = newUrl.replace(/\/+$/, '');
    
    // Replace versions with trailing slash first, then without
    const updated = raw
        .replaceAll(oldBase + '/', newBase + '/')
        .replaceAll(oldBase, newBase);
        
    return JSON.parse(updated);
}

/**
 * POST /api/admin/maps/[id]/mirror-r2
 *
 * 1. Fetches the Allmaps annotation for the map.
 * 2. Rewrites the IIIF image source URL to the R2 worker URL.
 * 3. Stores the updated annotation in Supabase Storage (annotations bucket).
 * 4. Updates maps.allmaps_id → self-hosted annotation URL.
 * 5. Updates maps.iiif_image → R2 worker URL.
 * 6. Returns tile CLI command and old source URL for the tiling script.
 */
export const POST: RequestHandler = async ({ locals, params }) => {
    const adminSupabase = await getAdminClient(locals);
    const mapId = params.id;

    const { data: map } = await adminSupabase
        .from('maps')
        .select('id, name, allmaps_id, iiif_image')
        .eq('id', mapId)
        .single();

    if (!map) throw error(404, 'Map not found');
    if (!map.allmaps_id) throw error(400, 'Map has no Allmaps ID — cannot fetch annotation');

    // Resolve annotation URL (bare hex ID or full URL)
    const annotationUrl = map.allmaps_id.startsWith('http')
        ? map.allmaps_id
        : `https://annotations.allmaps.org/images/${map.allmaps_id}`;

    const annotationRes = await fetch(annotationUrl + '?_t=' + Date.now(), {
        headers: { Accept: 'application/json' },
    });
    if (!annotationRes.ok) {
        throw error(502, `Failed to fetch annotation: ${annotationRes.statusText}`);
    }
    const annotation = await annotationRes.json();

    // Find the current IIIF source URL in the annotation
    const oldSourceUrl = extractSourceUrl(annotation);
    const newIiifBase = `${R2_BASE}/${mapId}`;

    // Rewrite source URL to R2
    const updated = oldSourceUrl
        ? rewriteSourceUrl(annotation, oldSourceUrl, newIiifBase)
        : annotation;

    // Store updated annotation in Supabase Storage
    const storagePath = `${mapId}.json`;
    const storageUrl = `${PUBLIC_SUPABASE_URL}/storage/v1/object/${ANNOTATIONS_BUCKET}/${storagePath}`;
    const uploadRes = await fetch(storageUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'x-upsert': 'true',
            'Cache-Control': 'no-cache',
        },
        body: JSON.stringify(updated, null, 2),
    });

    if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => String(uploadRes.status));
        throw error(500, `Storage upload failed (${uploadRes.status}): ${errText}`);
    }

    const storageEmailUrl = `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${ANNOTATIONS_BUCKET}/${storagePath}`;
    const publicAnnotationUrl = storageEmailUrl.split('?')[0]; // Clean URL

    // Update maps row
    await adminSupabase
        .from('maps')
        .update({
            iiif_image: newIiifBase,
            allmaps_id: publicAnnotationUrl,
            thumbnail: `${newIiifBase}/full/256,/0/default.jpg`,
            collection: 'Vietnam Map Archive',
        } as any)
        .eq('id', mapId);

    // Upsert R2 source in map_iiif_sources and set as primary.
    const { data: existingSources } = await (adminSupabase as any)
        .from('map_iiif_sources')
        .select('id, iiif_image')
        .eq('map_id', mapId);

    const r2Source = (existingSources ?? []).find((s: any) =>
        s.iiif_image?.includes('maparchive.vn')
    );

    if (r2Source) {
        await (adminSupabase as any)
            .from('map_iiif_sources')
            .update({ iiif_image: newIiifBase, is_primary: true })
            .eq('id', r2Source.id);
    } else {
        const maxOrder = (existingSources ?? []).reduce(
            (max: number, s: any) => Math.max(max, (s as any).sort_order ?? 0), 0
        );
        await (adminSupabase as any)
            .from('map_iiif_sources')
            .insert({
                map_id: mapId,
                label: 'Cloudflare R2',
                source_type: 'r2',
                iiif_image: newIiifBase,
                is_primary: true,
                sort_order: maxOrder + 1,
            });
    }

    // Use the non-R2 source as the proxy source to avoid loops.
    let originalIiifImage = null;
    if (map.iiif_image && !map.iiif_image.includes('maparchive.vn')) {
        originalIiifImage = map.iiif_image;
    } else if (oldSourceUrl && !oldSourceUrl.includes('maparchive.vn')) {
        originalIiifImage = oldSourceUrl;
    }

    // Build the download URL for the tiling script.
    // Use v2 or v3 paths based on the source type.
    let downloadUrl = null;
    if (originalIiifImage) {
        if (originalIiifImage.includes('gallica.bnf.fr')) {
            downloadUrl = `${originalIiifImage.replace(/\/$/, '')}/full/full/0/native.jpg`;
        } else {
            downloadUrl = `${originalIiifImage.replace(/\/$/, '')}/full/max/0/default.jpg`;
        }
    }

    return json({
        iiif_image: newIiifBase,
        annotation_url: publicAnnotationUrl,
        thumbnail: `${newIiifBase}/full/256,/0/default.jpg`,
        old_source_url: originalIiifImage,
        download_url: downloadUrl,
        // Pass original IIIF base as 3rd arg so tile_map.sh writes sources/{mapId} to R2
        tile_command: `./scripts/tile_map.sh ${mapId} "${downloadUrl ?? '<source-image-url>'}" "${originalIiifImage ?? ''}"`,
    });
};
