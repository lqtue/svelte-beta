import { json } from '@sveltejs/kit';
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
