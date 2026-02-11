import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const params = url.searchParams.toString();
	redirect(301, `/view${params ? '?' + params : ''}`);
};
