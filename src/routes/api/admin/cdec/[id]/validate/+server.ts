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

    const body = await request.json();
    const action: 'approve' | 'flag' = body.action;
    const slot: 1 | 2 = body.slot;
    const reason: string | undefined = body.reason;

    if (!['approve', 'flag'].includes(action)) {
        throw error(400, 'action must be approve or flag');
    }

    // Fetch current record
    const { data: recordRaw, error: fetchErr } = await supabase
        .from('cdec_records')
        .select('*')
        .eq('id', params.id)
        .single();

    if (fetchErr || !recordRaw) throw error(404, 'Record not found');
    const record = recordRaw as any;

    const patch: Record<string, unknown> = {};

    if (action === 'flag') {
        patch.status = 'flagged';
        const flagNote = `[Flagged by ${user.id}${reason ? ': ' + reason : ''}]`;
        patch.notes = record.notes ? record.notes + '\n' + flagNote : flagNote;
    } else {
        // approve — set validator slot
        if (slot === 1) {
            patch.validator_1 = user.id;
        } else {
            patch.validator_2 = user.id;
        }

        // Check if both validators are now set
        const v1 = slot === 1 ? user.id : record.validator_1;
        const v2 = slot === 2 ? user.id : record.validator_2;

        if (v1 && v2) {
            patch.status = 'validated';
            patch.validated_at = new Date().toISOString();
        } else {
            patch.status = 'in_review';
        }
    }

    const { data, error: updateErr } = await supabase
        .from('cdec_records')
        .update(patch as any)
        .eq('id', params.id)
        .select()
        .single();

    if (updateErr) throw error(500, updateErr.message);
    return json(data);
};
