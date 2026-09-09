/**
 * The front page's own data, server-rendered.
 *
 * It used to arrive in `onMount`: the HTML carried a masthead and the words
 * "Opening the archive…", and the featured sheet — the largest thing on the
 * page — appeared a round trip later and shoved everything below it down. A
 * crawler saw no catalogue at all, and the sheet count in the meta description
 * was always the hardcoded fallback, because nothing had counted anything yet.
 *
 * Favorites stay on the client: they need the reader's session, and they are
 * behind a tab nobody signed out can open.
 */

import type { PageServerLoad } from './$types';
import { adminClient } from '$lib/server/supabaseAdmin';
import { fetchFeaturedMaps, fetchMaps, fetchPublishedMapCount } from '$lib/data/maps/service';

/** How many maps stand in for the featured set when nothing is flagged. */
const FALLBACK_FEATURED = 6;

export const load: PageServerLoad = async () => {
  // The service key, so no row-level policy applies — every query here filters
  // by status itself, and a draft must never reach the front page.
  const supabase = adminClient();

  const [featured, mapCount] = await Promise.all([
    fetchFeaturedMaps(supabase),
    fetchPublishedMapCount(supabase),
  ]);

  // An archive with nothing flagged featured still has a front page.
  if (featured.length === 0) {
    const published = (await fetchMaps(supabase)).filter((m) => m.status !== 'draft');
    return { featured: published.slice(0, FALLBACK_FEATURED), mapCount };
  }

  return { featured, mapCount };
};
