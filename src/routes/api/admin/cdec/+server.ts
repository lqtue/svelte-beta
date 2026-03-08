import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

const ALLOWED_ROLES = ['admin', 'vwai_member'];

async function getAuthedClient(locals: App.Locals) {
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

    return { supabase, userId: user.id, role };
}

/** GET — list records with filters and pagination */
export const GET: RequestHandler = async ({ locals, url }) => {
    const { supabase } = await getAuthedClient(locals);

    const search      = url.searchParams.get('search') ?? '';
    const status      = url.searchParams.get('status');
    const province    = url.searchParams.get('province');
    const assigned_to = url.searchParams.get('assigned_to');
    const page        = parseInt(url.searchParams.get('page') ?? '0', 10);
    const limit       = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500);
    const offset      = page * limit;

    let query = supabase.from('cdec_records').select('*', { count: 'exact' });

    if (search) {
        query = query.or(
            `cdec_number.ilike.%${search}%,log_number.ilike.%${search}%,person_name.ilike.%${search}%`
        );
    }
    if (status)      query = query.eq('status', status);
    if (province)    query = query.eq('province', province);
    if (assigned_to === 'unassigned') {
        query = query.is('assigned_to', null);
    } else if (assigned_to) {
        query = query.eq('assigned_to', assigned_to);
    }

    const { data, count, error: dbErr } = await query
        .order('cdec_number')
        .range(offset, offset + limit - 1);

    if (dbErr) throw error(500, dbErr.message);
    return json({ records: data ?? [], total: count ?? 0 });
};

/** POST — create a new record (admin only) */
export const POST: RequestHandler = async ({ locals, request }) => {
    const { supabase, role } = await getAuthedClient(locals);
    if (role !== 'admin') throw error(403, 'Forbidden');

    const body = await request.json();
    const { data, error: dbErr } = await supabase
        .from('cdec_records')
        .insert(body)
        .select()
        .single();

    if (dbErr) throw error(500, dbErr.message);
    return json(data, { status: 201 });
};
