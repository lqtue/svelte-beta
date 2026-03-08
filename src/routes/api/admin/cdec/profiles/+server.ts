/**
 * GET /api/admin/cdec/profiles?ids=uuid1,uuid2,...
 * Returns { [id]: display_name } for the requested profile IDs.
 */
import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

const ALLOWED_ROLES = ['admin', 'vwai_member'];

export const GET: RequestHandler = async ({ locals, url }) => {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');

    const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    const role = (profileData as any)?.role as string | undefined;
    if (!role || !ALLOWED_ROLES.includes(role)) throw error(403, 'Forbidden');

    const idsParam = url.searchParams.get('ids') ?? '';
    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);

    if (ids.length === 0) return json({});

    const { data, error: dbErr } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', ids);

    if (dbErr) throw error(500, dbErr.message);

    const result: Record<string, string> = {};
    for (const p of data ?? []) {
        result[p.id] = (p as any).display_name || p.id.slice(0, 8);
    }
    return json(result);
};
