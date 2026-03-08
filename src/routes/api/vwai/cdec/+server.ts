import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

/** Any authenticated user can access VWAI records */
async function getAuthedClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');
    const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
    return { supabase, userId: user.id };
}

/** GET — list records with filters and pagination */
export const GET: RequestHandler = async ({ locals, url }) => {
    const { supabase } = await getAuthedClient(locals);

    const search        = url.searchParams.get('search') ?? '';
    const status        = url.searchParams.get('status');
    const province      = url.searchParams.get('province');
    const district      = url.searchParams.get('district');
    const tactical_zone = url.searchParams.get('tactical_zone');
    const geolocated    = url.searchParams.get('geolocated');
    const date_from     = url.searchParams.get('date_from');
    const date_to       = url.searchParams.get('date_to');
    const assigned_to   = url.searchParams.get('assigned_to');
    const page          = parseInt(url.searchParams.get('page') ?? '0', 10);
    const limit         = Math.min(parseInt(url.searchParams.get('limit') ?? '1000', 10), 1000);
    const offset        = page * limit;

    let query = supabase.from('cdec_records').select('*', { count: 'exact' });

    if (search) {
        query = query.or(
            `cdec_number.ilike.%${search}%,log_number.ilike.%${search}%,` +
            `person_name.ilike.%${search}%,person_alias.ilike.%${search}%,` +
            `province.ilike.%${search}%,district.ilike.%${search}%,` +
            `village.ilike.%${search}%,location_text.ilike.%${search}%,` +
            `tactical_zone.ilike.%${search}%,summary.ilike.%${search}%`
        );
    }
    if (status)        query = query.eq('status', status);
    if (province)      query = query.ilike('province', `%${province}%`);
    if (district)      query = query.ilike('district', `%${district}%`);
    if (tactical_zone) query = query.ilike('tactical_zone', `%${tactical_zone}%`);
    if (geolocated === '1') {
        query = query.not('coord_wgs84_lat', 'is', null).not('coord_wgs84_lon', 'is', null);
    }
    if (date_from) query = query.gte('intel_date', date_from);
    if (date_to)   query = query.lte('intel_date', date_to);
    if (assigned_to === 'unassigned') {
        query = query.is('assigned_to', null);
    } else if (assigned_to === 'mine') {
        // Handled server-side — caller passes actual userId separately
    } else if (assigned_to) {
        query = query.eq('assigned_to', assigned_to);
    }

    const { data, count, error: dbErr } = await query
        .order('cdec_number')
        .range(offset, offset + limit - 1);

    if (dbErr) throw error(500, dbErr.message);
    return json({ records: data ?? [], total: count ?? 0 });
};
