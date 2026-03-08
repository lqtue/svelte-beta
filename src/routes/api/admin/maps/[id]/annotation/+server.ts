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

interface GCP {
    resourceCoords: [number, number];
    geo: [number, number];
}

/**
 * PATCH — update GCPs in a self-hosted annotation JSON stored in Supabase Storage.
 * Body: { gcps: [{resourceCoords:[x,y], geo:[lon,lat]}, ...] }
 * Order: NW, NE, SE, SW
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
    const adminSupabase = await getAdminClient(locals);
    const mapId = params.id;

    const body = await request.json();
    const gcps: GCP[] = body.gcps;

    if (!Array.isArray(gcps) || gcps.length !== 4) {
        throw error(400, 'Expected exactly 4 GCPs');
    }

    // Fetch map to get allmaps_id (must be a URL for self-hosted)
    const { data: map } = await adminSupabase
        .from('maps')
        .select('allmaps_id')
        .eq('id', mapId)
        .single();

    if (!map) throw error(404, 'Map not found');

    const annotationUrl = map.allmaps_id;
    if (!annotationUrl?.startsWith('http')) {
        throw error(400, 'This map does not use a self-hosted annotation URL');
    }

    // Fetch current annotation JSON — bypass any server-side cache
    const bustUrl = annotationUrl + (annotationUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
    const fetchRes = await fetch(bustUrl, { cache: 'no-store' });
    if (!fetchRes.ok) {
        throw error(502, `Failed to fetch annotation: ${fetchRes.statusText}`);
    }
    const annotation = await fetchRes.json();

    // Extract source info for SVG dimensions
    const item = annotation.items?.[0];
    if (!item) throw error(400, 'No annotation items found');

    const target = item.target;
    const source = typeof target === 'string' ? { id: target } : (target.source ?? target);
    const sourceId = typeof source === 'string' ? source : source.id;
    const imgWidth: number = source.width ?? 0;
    const imgHeight: number = source.height ?? 0;

    // Rebuild the neatline polygon from GCP resource coords (NW, NE, SE, SW)
    const points = gcps
        .map((g) => `${g.resourceCoords[0]},${g.resourceCoords[1]}`)
        .join(' ');

    const svgValue = `<svg width="${imgWidth}" height="${imgHeight}"><polygon points="${points}" /></svg>`;

    // Rebuild GCP features
    const features = gcps.map((g) => ({
        type: 'Feature',
        properties: {
            resourceCoords: g.resourceCoords,
        },
        geometry: {
            type: 'Point',
            coordinates: g.geo,
        },
    }));

    // Update annotation in place
    item.body = {
        type: 'FeatureCollection',
        features,
    };

    if (typeof target === 'string') {
        item.target = {
            type: 'SpecificResource',
            source: sourceId,
            selector: {
                type: 'SvgSelector',
                value: svgValue,
            },
        };
    } else {
        target.selector = {
            type: 'SvgSelector',
            value: svgValue,
        };
    }

    // Extract Supabase Storage path from URL.
    // Strip query params first, then parse:
    // https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
    const cleanUrl = annotationUrl.split('?')[0];
    const storageMarker = '/object/public/';
    const markerIdx = cleanUrl.indexOf(storageMarker);
    if (markerIdx === -1) {
        throw error(400, 'Cannot determine storage path from annotation URL');
    }
    const storagePath = cleanUrl.slice(markerIdx + storageMarker.length);
    const bucketEnd = storagePath.indexOf('/');
    if (bucketEnd === -1) throw error(400, 'Cannot parse bucket from storage path');
    const bucket = storagePath.slice(0, bucketEnd);
    const filePath = storagePath.slice(bucketEnd + 1);

    const annotationJson = JSON.stringify(annotation, null, 2);

    // Use the Storage REST API directly — more reliable than the JS client
    // for text/JSON payloads in server environments.
    // POST with x-upsert:true creates or overwrites the file.
    const storageUrl = `${PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`;
    const uploadRes = await fetch(storageUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'x-upsert': 'true',
            'Cache-Control': 'no-cache',
        },
        body: annotationJson,
    });

    if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => String(uploadRes.status));
        console.error('Storage upload failed:', uploadRes.status, errText);
        throw error(500, `Storage upload failed (${uploadRes.status}): ${errText}`);
    }

    return json({ success: true });
};
