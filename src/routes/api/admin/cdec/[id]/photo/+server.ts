import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

const ALLOWED_ROLES = ['admin', 'vwai_member'];

export const POST: RequestHandler = async ({ locals, params, request }) => {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');

    const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    const role = (profileData as any)?.role as string | undefined;
    if (!role || !ALLOWED_ROLES.includes(role)) {
        throw error(403, 'Forbidden');
    }

    const { dataUrl } = await request.json();
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        throw error(400, 'Valid dataUrl required');
    }

    // Decode base64
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const ext = mime.split('/')[1] ?? 'png';

    const buffer = Buffer.from(base64, 'base64');
    const path = `${params.id}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
        .from('cdec-photos')
        .upload(path, buffer, { contentType: mime, upsert: true });

    if (uploadErr) throw error(500, uploadErr.message);

    const { data: urlData } = supabase.storage
        .from('cdec-photos')
        .getPublicUrl(path);

    const photoUrl = urlData.publicUrl;

    // Update record
    await supabase
        .from('cdec_records')
        .update({ photo_url: photoUrl } as any)
        .eq('id', params.id);

    return json({ url: photoUrl });
};
