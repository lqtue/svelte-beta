import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

/**
 * POST /api/vwai/cdec/[id]/claim
 *
 * Atomically claims an unclaimed record for the current user.
 * Uses UPDATE WHERE assigned_to IS NULL to prevent double-claims.
 * Returns 409 if already claimed by someone else.
 */
export const POST: RequestHandler = async ({ locals, params }) => {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');

    const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Atomic claim: only succeeds if assigned_to IS NULL
    const { data, error: dbErr } = await supabase
        .from('cdec_records')
        .update({
            assigned_to: user.id,
            claimed_at: new Date().toISOString(),
            status: 'in_review',
        } as any)
        .eq('id', params.id)
        .is('assigned_to', null)
        .select()
        .single();

    if (dbErr) throw error(500, dbErr.message);
    if (!data) {
        // Row exists but assigned_to was not null — already claimed
        const { data: existing } = await supabase
            .from('cdec_records')
            .select('assigned_to, status')
            .eq('id', params.id)
            .single();
        if (!existing) throw error(404, 'Not found');
        throw error(409, 'This record has already been claimed');
    }

    return json(data);
};
