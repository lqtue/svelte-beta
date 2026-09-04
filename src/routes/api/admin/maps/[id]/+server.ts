import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/auth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid, dbError } from '$lib/server/http';
import { pickMapFields } from '$lib/server/mapFields';
import { deriveAllmapsId } from '$lib/core/iiif/allmapsId';

/** PATCH — update map fields */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');
  const supabase = adminClient();

  const body = await request.json();
  const updateData = pickMapFields(body);

  // Every field the caller sent was dropped by the allow-list — an unknown
  // column, or a value the coercion refused (a string where `asObject` wants an
  // object). PostgREST answers an empty update with a 500, which reads as a
  // server fault for what is squarely a bad request.
  if (Object.keys(updateData).length === 0) {
    throw error(400, 'No writable map fields in the request');
  }

  // Auto-derive allmaps_id when iiif_image is being set and caller didn't
  // provide an explicit allmaps_id. Look up the existing row to see whether
  // we already have one — never overwrite a present value silently.
  if (updateData.iiif_image && body.allmaps_id === undefined) {
    const { data: existing } = await supabase
      .from('maps')
      .select('allmaps_id')
      .eq('id', mapId)
      .single();
    if (!existing?.allmaps_id) {
      try {
        updateData.allmaps_id = await deriveAllmapsId(updateData.iiif_image as string);
      } catch (e) {
        console.error('[admin/maps PATCH] deriveAllmapsId failed:', e);
      }
    }
  }

  const { data, error: err } = await supabase
    .from('maps')
    .update(updateData)
    .eq('id', mapId)
    .select()
    .single();

  if (err) dbError(err, 'Could not update map');
  return json(data);
};

/** DELETE — remove a map */
export const DELETE: RequestHandler = async ({ locals, params }) => {
  await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');

  const { error: err } = await adminClient().from('maps').delete().eq('id', mapId);

  if (err) dbError(err, 'Could not delete map');
  return json({ success: true });
};
