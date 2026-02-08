import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/';

  if (code) {
    await locals.supabase.auth.exchangeCodeForSession(code);
  }

  // Only allow relative paths to prevent open redirect attacks
  const safePath = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  redirect(303, safePath);
};
