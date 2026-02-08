import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  const { session } = await locals.safeGetSession();
  return { session };
};
