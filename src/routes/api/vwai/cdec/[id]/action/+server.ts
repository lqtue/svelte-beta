import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

// Editor-added fields to wipe on unclaim
const EDITOR_FIELDS = [
    'location_text','mgrs_validated','coord_datum','coord_wgs84_lat','coord_wgs84_lon',
    'tactical_zone','province','district','village','location_other',
    'unit_division','unit_brigade','unit_regiment','unit_battalion','unit_company','unit_platoon','unit_other',
    'unit2_division','unit2_brigade','unit2_regiment','unit2_battalion','unit2_company','unit2_platoon','unit2_other',
    'person_name','person_alias','person_dob','person_hometown','person_father',
    'person_mother','person_spouse','person_relatives','person_unit','person_enlist_year',
    'summary','family_info_current','unit_info_current','vmai_info','monument_info','us_info','rvn_info',
    'ref_nara','ref_us_library','ref_vn_national_archive','ref_vn_library',
    'ref_provincial_archive','ref_books','ref_internet','report_draft_link','notes',
];

/**
 * POST /api/vwai/cdec/[id]/action
 * Body: { action: 'submit' | 'validate' | 'flag' | 'close' | 'unclaim', reason?: string }
 *
 * submit   — assigned editor submits for validation (in_review/submitted → submitted)
 * validate — any other auth'd user approves (adds validator slot)
 * flag     — any auth'd user flags the record
 * close    — admin finalizes (validated → closed)
 * unclaim  — assigned editor releases record and reverts all edits (→ pending)
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');

    const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const body = await request.json() as { action: string; reason?: string };
    const { action, reason } = body;

    const { data: rec, error: fetchErr } = await supabase
        .from('cdec_records')
        .select('*')
        .eq('id', params.id)
        .single();

    if (fetchErr || !rec) throw error(404, 'Not found');
    const record = rec as any;

    let patch: Record<string, unknown> = {};

    if (action === 'submit') {
        if (record.assigned_to !== user.id) throw error(403, 'Only the assigned editor may submit');
        if (record.status !== 'in_review' && record.status !== 'submitted') throw error(400, `Cannot submit from status "${record.status}"`);
        patch = { status: 'submitted' };

    } else if (action === 'validate') {
        if (record.assigned_to === user.id) throw error(400, 'Assigned editor cannot validate their own record');
        if (record.status !== 'submitted' && record.status !== 'validated') {
            throw error(400, 'Record must be submitted before validation');
        }
        // Fill validator slots
        if (!record.validator_1) {
            patch = { validator_1: user.id };
        } else if (!record.validator_2 && record.validator_1 !== user.id) {
            patch = {
                validator_2: user.id,
                status: 'validated',
                validated_at: new Date().toISOString(),
            };
        } else {
            throw error(409, 'Validation slots already filled');
        }

    } else if (action === 'flag') {
        patch = {
            status: 'flagged',
            notes: record.notes
                ? `${record.notes}\n[${new Date().toISOString()}] Flagged${reason ? ': ' + reason : ''}`
                : `[${new Date().toISOString()}] Flagged${reason ? ': ' + reason : ''}`,
        };

    } else if (action === 'close') {
        // Admin only
        const { data: profileData } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
        const role = (profileData as any)?.role as string | undefined;
        if (role !== 'admin') throw error(403, 'Only admin may close records');
        patch = { status: 'closed' };

    } else if (action === 'unclaim') {
        if (record.assigned_to !== user.id) throw error(403, 'Only the assigned editor may unclaim');
        // Revert all editor-added fields to null, reset workflow
        patch = {
            assigned_to: null,
            claimed_at: null,
            status: 'pending',
            validator_1: null,
            validator_2: null,
            validated_at: null,
        };
        for (const f of EDITOR_FIELDS) patch[f] = null;

    } else {
        throw error(400, `Unknown action "${action}"`);
    }

    const { data, error: dbErr } = await supabase
        .from('cdec_records')
        .update(patch as any)
        .eq('id', params.id)
        .select()
        .single();

    if (dbErr) throw error(500, dbErr.message);
    return json(data);
};
