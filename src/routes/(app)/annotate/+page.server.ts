import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const qs = url.search ?? '';
	throw redirect(301, `/studio${qs}`);
};
