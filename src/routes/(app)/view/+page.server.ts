import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// /view has been folded into /explore — same chrome, plus a welcome chooser
// that defaults to "Use my location" or "Show all maps". Share-link query
// params (?map=, ?story=) and the URL hash are both preserved so existing
// links keep working; /explore skips the welcome modal when a deeplink is
// detected.
export const load: PageServerLoad = ({ url }) => {
  throw redirect(301, '/explore' + url.search);
};
