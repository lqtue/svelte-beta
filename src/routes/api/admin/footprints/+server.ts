import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

async function getAdminClient(locals: App.Locals) {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) throw error(401, 'Unauthorized');

	const adminSupabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);

	const { data: profile } = await adminSupabase
		.from('profiles')
		.select('role')
		.eq('id', user.id)
		.single();

	if ((profile as any)?.role !== 'admin') throw error(403, 'Forbidden');

	return adminSupabase;
}

/** GET /api/admin/footprints?map_id=&status= */
export const GET: RequestHandler = async ({ locals, url }) => {
	const adminSupabase = await getAdminClient(locals);

	const mapId = url.searchParams.get('map_id');
	const status = url.searchParams.get('status') ?? 'needs_review';

	if (!mapId) throw error(400, 'map_id is required');

	const { data, error: dbError } = await adminSupabase
		.from('footprint_submissions')
		.select('id, map_id, iiif_canvas, pixel_polygon, feature_type, name, category, confidence, status, created_at')
		.eq('map_id', mapId)
		.eq('status', status)
		.order('confidence', { ascending: false });

	if (dbError) throw error(500, dbError.message);
	return json(data);
};

/** PATCH /api/admin/footprints  { id, status: 'submitted' | 'rejected' } */
export const PATCH: RequestHandler = async ({ locals, request }) => {
	const adminSupabase = await getAdminClient(locals);

	const body = await request.json();
	const { id, status, pixel_polygon, feature_type, name, category } = body as {
		id: string;
		status: string;
		pixel_polygon?: [number, number][];
		feature_type?: string;
		name?: string;
		category?: string;
	};

	if (!id || !status) throw error(400, 'id and status are required');
	if (!['submitted', 'rejected'].includes(status)) {
		throw error(400, 'status must be submitted or rejected');
	}

	const update: Record<string, any> = { status };
	if (pixel_polygon) {
		update.pixel_polygon = pixel_polygon;
		update.source = 'sam-corrected';
	}
	if (feature_type) {
		update.feature_type = feature_type;
		update.source = 'sam-corrected';
	}
	if (name !== undefined) update.name = name;
	if (category !== undefined) update.category = category;

	const { error: dbError } = await adminSupabase
		.from('footprint_submissions')
		.update(update as never)
		.eq('id', id)
		.eq('status', 'needs_review'); // only transition from needs_review

	if (dbError) throw error(500, dbError.message);
	return json({ ok: true });
};
