import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

async function getAuthedClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');
    const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
    return { supabase, userId: user.id };
}

export const GET: RequestHandler = async ({ locals, params }) => {
    const { supabase } = await getAuthedClient(locals);
    const { data, error: dbErr } = await supabase
        .from('cdec_records')
        .select('*')
        .eq('id', params.id)
        .single();
    if (dbErr) throw error(404, 'Not found');
    return json(data);
};

// Fields a researcher (assigned editor) may update
const EDITOR_FIELDS = new Set([
    'location_text', 'mgrs_validated', 'coord_datum', 'coord_wgs84_lat', 'coord_wgs84_lon',
    'tactical_zone', 'province', 'district', 'village', 'location_other',
    'unit_division', 'unit_brigade', 'unit_regiment', 'unit_battalion', 'unit_company', 'unit_platoon', 'unit_other',
    'unit2_division', 'unit2_brigade', 'unit2_regiment', 'unit2_battalion', 'unit2_company', 'unit2_platoon', 'unit2_other',
    'person_name', 'person_alias', 'person_dob', 'person_hometown', 'person_father',
    'person_mother', 'person_spouse', 'person_relatives', 'person_unit', 'person_enlist_year',
    'summary', 'family_info_current', 'unit_info_current', 'vmai_info', 'monument_info', 'us_info', 'rvn_info',
    'ref_nara', 'ref_us_library', 'ref_vn_national_archive', 'ref_vn_library',
    'ref_provincial_archive', 'ref_books', 'ref_internet', 'report_draft_link', 'notes',
]);

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
    const { supabase, userId } = await getAuthedClient(locals);

    // Load record to check ownership
    const { data: existing, error: fetchErr } = await supabase
        .from('cdec_records')
        .select('assigned_to, status')
        .eq('id', params.id)
        .single();

    if (fetchErr || !existing) throw error(404, 'Not found');

    const assignedTo = (existing as any)?.assigned_to as string | null;
    if (assignedTo !== userId) throw error(403, 'Only the assigned editor may update this record');

    const body = await request.json();

    // Strip disallowed fields
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
        if (EDITOR_FIELDS.has(k)) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) throw error(400, 'No updatable fields');

    const { data, error: dbErr } = await supabase
        .from('cdec_records')
        .update(patch as any)
        .eq('id', params.id)
        .select()
        .single();

    if (dbErr) throw error(500, dbErr.message);
    return json(data);
};
