import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

async function assertAdmin(locals: App.Locals) {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) throw error(401, 'Unauthorized');
	const adminClient = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
	const { data: profile } = await adminClient
		.from('profiles')
		.select('role')
		.eq('id', user.id)
		.single();
	if ((profile as any)?.role !== 'admin') throw error(403, 'Forbidden');
	return adminClient;
}

async function annotationExists(allmapsId: string): Promise<boolean> {
	try {
		const res = await fetch(`https://annotations.allmaps.org/images/${allmapsId}`, {
			method: 'HEAD',
			signal: AbortSignal.timeout(8000),
		});
		return res.ok;
	} catch {
		return false;
	}
}

/**
 * POST — probe the Allmaps annotation server for every map with allmaps_id
 * set and georef_done=false, and flip georef_done=true on hits. Idempotent;
 * safe to run on a cron or as a button click. Returns { checked, flipped, ids }.
 *
 * Optional body: { mapId?: string } to probe a single row.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const adminClient = await assertAdmin(locals);

	let mapId: string | undefined;
	try { ({ mapId } = (await request.json()) as { mapId?: string }); } catch { /* empty body ok */ }

	let q = adminClient
		.from('maps')
		.select('id, name, allmaps_id')
		.not('allmaps_id', 'is', null)
		.eq('georef_done', false);
	if (mapId) q = q.eq('id', mapId);

	const { data: rows, error: dbError } = await q;
	if (dbError) throw error(500, dbError.message);

	const flippedIds: string[] = [];
	for (const r of (rows ?? []) as Array<{ id: string; name: string; allmaps_id: string }>) {
		if (await annotationExists(r.allmaps_id)) {
			const { error: updErr } = await (adminClient as any)
				.from('maps').update({ georef_done: true }).eq('id', r.id);
			if (!updErr) flippedIds.push(r.id);
		}
	}

	return json({ checked: rows?.length ?? 0, flipped: flippedIds.length, ids: flippedIds });
};
