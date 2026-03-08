import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

export const GET: RequestHandler = async ({ locals, url }) => {
    const { session } = await locals.safeGetSession();
    if (!session) throw error(401, 'Unauthorized');

    const ids = url.searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
    if (ids.length === 0) return json({});

    const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data, error: dbErr } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .in('id', ids);

    if (dbErr) throw error(500, dbErr.message);

    const map: Record<string, string> = {};
    for (const p of data ?? []) {
        const pp = p as any;
        map[pp.id] = pp.display_name || pp.email || pp.id;
    }
    return json(map);
};
