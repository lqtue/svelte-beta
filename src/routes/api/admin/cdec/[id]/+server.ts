import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

const ALLOWED_ROLES = ['admin', 'vwai_member'];

// Fields that only admins can modify
const ADMIN_ONLY_FIELDS = new Set(['status', 'assigned_to', 'validator_1', 'validator_2', 'validated_at']);

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

/** GET — single record */
export const GET: RequestHandler = async ({ locals, params }) => {
    const { supabase } = await getAuthedClient(locals);

    const { data, error: dbErr } = await supabase
        .from('cdec_records')
        .select('*')
        .eq('id', params.id)
        .single();

    if (dbErr) throw error(dbErr.code === 'PGRST116' ? 404 : 500, dbErr.message);
    return json(data);
};

/** PATCH — update record with field-level permission check */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
    const { supabase, userId, role } = await getAuthedClient(locals);

    const patch = await request.json();

    // vwai_member may not touch admin-only fields
    if (role === 'vwai_member') {
        for (const key of Object.keys(patch)) {
            if (ADMIN_ONLY_FIELDS.has(key)) {
                throw error(403, `Field '${key}' is restricted to admins`);
            }
        }

        // Ensure they're only editing their own record
        const { data: existing } = await supabase
            .from('cdec_records')
            .select('assigned_to')
            .eq('id', params.id)
            .single();

        if ((existing as any)?.assigned_to !== userId) {
            throw error(403, 'You can only edit records assigned to you');
        }
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
