import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';
import type { CdecStatus } from '$lib/cdec/types';

const ALLOWED_ROLES = ['admin', 'vwai_member'];

export const GET: RequestHandler = async ({ locals }) => {
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

    const { data, error: dbErr } = await supabase
        .from('cdec_records')
        .select('status, coord_wgs84_lat, assigned_to');

    if (dbErr) throw error(500, dbErr.message);

    const rows = (data ?? []) as Array<{ status: string; coord_wgs84_lat: number | null; assigned_to: string | null }>;
    const by_status: Record<string, number> = {
        pending: 0, in_review: 0, validated: 0, flagged: 0, duplicate: 0,
    };
    let geolocated = 0;
    let assigned = 0;

    for (const r of rows) {
        const s = r.status as CdecStatus;
        if (by_status[s] != null) by_status[s]++;
        if (r.coord_wgs84_lat != null) geolocated++;
        if (r.assigned_to != null) assigned++;
    }

    return json({
        total: rows.length,
        by_status,
        geolocated,
        assigned,
    });
};
