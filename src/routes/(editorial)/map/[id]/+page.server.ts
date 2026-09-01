/**
 * Share page loader. Server-rendered on purpose: this is the URL people paste
 * into chat apps and social media, so the crawler has to see the title, the
 * description and the image without running any JavaScript.
 *
 * Only published maps resolve — a draft link 404s rather than leaking a record
 * that is not meant to be public yet.
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid } from '$lib/server/http';

export const load: PageServerLoad = async ({ params }) => {
  const id = assertUuid(params.id, 'map id');

  const { data: map } = await adminClient()
    .from('maps')
    .select(
      'id, name, dc_description, year, year_label, creator, dc_publisher, holding_institution, collection, map_type, location, thumbnail, iiif_image, allmaps_id, annotation_url, georef_done, status'
    )
    .eq('id', id)
    .in('status', ['public', 'featured'])
    .maybeSingle();

  if (!map) throw error(404, 'No published map with that id');

  return { map };
};
