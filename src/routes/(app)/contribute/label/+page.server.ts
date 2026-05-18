import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// /contribute/label was the standalone OCR bbox review tool.
// It's been folded into /contribute/digitalize (Triage + OCR review on one canvas).
export const load: PageServerLoad = ({ url }) => {
  throw redirect(301, '/contribute/digitalize' + url.search);
};
