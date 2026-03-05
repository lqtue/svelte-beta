import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY, IA_S3_ACCESS_KEY, IA_S3_SECRET_KEY } from '$env/static/private';
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

/**
 * POST — Upload an image to Internet Archive S3 without an existing map record.
 * Returns a IIIF URL that can be used to create a georef submission.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
    await getAdminClient(locals);

    const formData = await request.formData();
    const image = formData.get('image') as File;
    const name = (formData.get('name') as string) || 'Untitled Map';

    if (!image) throw error(400, 'No image file provided');

    const identifier = `vma-upload-${crypto.randomUUID()}`;
    const filename = image.name.replace(/[^a-zA-Z0-9.-]/g, '_');

    const iaUrl = `https://s3.us.archive.org/${identifier}/${filename}`;
    const response = await fetch(iaUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `LOW ${IA_S3_ACCESS_KEY}:${IA_S3_SECRET_KEY}`,
            'x-amz-auto-make-bucket': '1',
            'x-archive-meta-title': name,
            'x-archive-meta-mediatype': 'image',
            'x-archive-meta-collection': 'opensource_image',
            'Content-Type': image.type
        },
        body: await image.arrayBuffer()
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('IA S3 Upload Error:', errorText);
        throw error(500, `Internet Archive upload failed: ${errorText}`);
    }

    const iiif_url = `https://iiif.archive.org/iiif/3/${identifier}%2F${filename}/info.json`;

    return json({
        iiif_url,
        ia_identifier: identifier,
        ia_filename: filename
    });
};
