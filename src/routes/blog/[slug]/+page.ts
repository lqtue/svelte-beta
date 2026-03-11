import { error } from '@sveltejs/kit';
import { getPost } from '$lib/blog/posts';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const post = getPost(params.slug);
	if (!post) {
		throw error(404, `Post not found: ${params.slug}`);
	}
	return { post };
};
