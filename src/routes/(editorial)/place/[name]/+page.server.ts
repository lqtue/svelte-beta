/**
 * Place page loader — one URL per attested place name.
 *
 * Server-rendered, like the share page: this is the page a search engine or a
 * person arriving from outside should be able to read without running any
 * JavaScript. Everything interactive is one click away at /explore.
 *
 * The gazetteer view (migration 067) does the grouping, so a name written three
 * ways across four decades is one page, not three. Draft maps are gated by the
 * view's `security_invoker` plus migration 065's read policy — but this loader
 * runs on the service client, so it filters published maps explicitly rather
 * than relying on that.
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { adminClient } from '$lib/server/supabaseAdmin';

/** URL slug → the gazetteer's `name_key`: lowercase, unaccented, single spaces. */
function slugToKey(slug: string): string {
  return decodeURIComponent(slug)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The gazetteer's `name_key` → the slug used in URLs. */
function keyToSlug(key: string): string {
  return key.replace(/\s+/g, '-');
}

export const load: PageServerLoad = async ({ params }) => {
  const key = slugToKey(params.name);
  if (!key || key.length < 2) throw error(404, 'No such place');

  const supabase = adminClient();
  const { data: place } = await supabase
    .from('place_names')
    .select(
      'name_key, name, variants, years, first_year, last_year, map_ids, mentions, category, lng, lat, geom_rmse'
    )
    .eq('name_key', key)
    .maybeSingle();

  if (!place) throw error(404, 'No place with that name in the archive');

  // The sheets that name it, oldest first. Published only: an anonymous reader
  // must not learn a draft's title from a place page.
  const { data: maps } = await supabase
    .from('maps')
    .select('id, name, year, year_label, thumbnail, holding_institution, status')
    .in('id', (place.map_ids as string[]) ?? [])
    .in('status', ['public', 'featured'])
    .order('year');

  if (!maps?.length) throw error(404, 'No published map names that place');

  return { place, maps, slug: keyToSlug(place.name_key as string) };
};
