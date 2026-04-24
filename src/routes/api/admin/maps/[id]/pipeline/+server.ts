/**
 * GET  /api/admin/maps/[id]/pipeline — current pipeline stage + timestamps
 * PATCH /api/admin/maps/[id]/pipeline — advance stage (body: { stage })
 */

import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

const VALID_STAGES = [
	'idle', 'ocr_queued', 'ocr_done', 'reviewed',
	'seg_queued', 'seg_done', 'seg_reviewed', 'exported'
] as const;

async function getAdminClient(locals: App.Locals) {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) throw error(401, 'Unauthorized');

	const adminSupabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);

	const { data: profile } = await (adminSupabase as any)
		.from('profiles')
		.select('role')
		.eq('id', user.id)
		.single();

	if ((profile as any)?.role !== 'admin') throw error(403, 'Forbidden');

	return adminSupabase;
}

export const GET: RequestHandler = async ({ locals, params }) => {
	const adminSupabase = await getAdminClient(locals);

	const { data, error: err } = await (adminSupabase as any)
		.from('map_pipeline_status')
		.select('*')
		.eq('map_id', params.id)
		.maybeSingle();

	if (err) throw error(500, err.message);

	return json(data ?? { map_id: params.id, stage: 'idle' });
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const adminSupabase = await getAdminClient(locals);

	const body = await request.json().catch(() => ({}));
	const stage = body.stage as string;

	if (!VALID_STAGES.includes(stage as typeof VALID_STAGES[number])) {
		throw error(400, `Invalid stage: ${stage}`);
	}

	const extra: Record<string, string> = {};
	if (stage === 'reviewed') extra.reviewed_at = new Date().toISOString();

	const { data, error: err } = await (adminSupabase as any)
		.from('map_pipeline_status')
		.upsert({ map_id: params.id, stage, ...extra }, { onConflict: 'map_id' })
		.select()
		.single();

	if (err) throw error(500, err.message);

	return json(data);
};
