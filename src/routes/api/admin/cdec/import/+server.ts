import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

export const POST: RequestHandler = async ({ locals, request }) => {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');

    const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if ((profileData as any)?.role !== 'admin') throw error(403, 'Admin only');

    const body = await request.json();
    const records: Record<string, unknown>[] = body.records ?? [];

    if (!Array.isArray(records) || records.length === 0) {
        throw error(400, 'records array required');
    }

    // Upsert on cdec_number
    const { data, error: dbErr } = await supabase
        .from('cdec_records')
        .upsert(records as any, { onConflict: 'cdec_number', ignoreDuplicates: false })
        .select('id');

    if (dbErr) throw error(500, dbErr.message);
    return json({ upserted: data?.length ?? 0 });
};
