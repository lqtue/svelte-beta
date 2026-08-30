import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/auth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid } from '$lib/server/http';
import { uploadToIA } from '$lib/server/ia';

/**
 * POST — Upload a replacement image for a map.
 * Uploads to Internet Archive S3 and returns the resulting IIIF image URL;
 * the caller decides whether to persist it on the map row.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
  await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');

  const { data: map } = await adminClient()
    .from('maps')
    .select('name, allmaps_id')
    .eq('id', mapId)
    .single();

  if (!map) throw error(404, 'Map not found');

  const formData = await request.formData();
  const image = formData.get('image') as File;
  if (!image) throw error(400, 'No image file provided');

  const upload = await uploadToIA(image, `vma-map-${mapId}`, map.name);

  return json({
    success: true,
    ia_identifier: upload.identifier,
    ia_filename: upload.filename,
    iiif_url: upload.iiifUrl,
  });
};
