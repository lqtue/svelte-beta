/**
 * TEMPORARY — delete once the Pages environment is settled.
 *
 * `/api/search` fails with "supabaseKey is required" while the build succeeds,
 * which means the name resolves at build time but the value is empty. This
 * reports what each env channel actually holds, so the next deploy answers the
 * question instead of testing another hypothesis.
 *
 * It reports **presence and length only**. No value, prefix or suffix of any
 * secret is returned, and the dynamic branch lists names, never values.
 */

import { json } from '@sveltejs/kit';
import { SUPABASE_SERVICE_KEY, IA_S3_ACCESS_KEY, IA_S3_SECRET_KEY } from '$env/static/private';
import { env as dynamicPrivate } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

const shape = (v: unknown) => ({
  present: typeof v === 'string' && v.length > 0,
  length: typeof v === 'string' ? v.length : null,
});

export async function GET() {
  return json({
    note: 'presence and length only; no values are returned',
    staticPrivate: {
      SUPABASE_SERVICE_KEY: shape(SUPABASE_SERVICE_KEY),
      IA_S3_ACCESS_KEY: shape(IA_S3_ACCESS_KEY),
      IA_S3_SECRET_KEY: shape(IA_S3_SECRET_KEY),
    },
    dynamicPrivate: {
      names: Object.keys(dynamicPrivate ?? {}).sort(),
      SUPABASE_SERVICE_KEY: shape(dynamicPrivate?.SUPABASE_SERVICE_KEY),
    },
    staticPublic: {
      PUBLIC_SUPABASE_URL: shape(PUBLIC_SUPABASE_URL),
      PUBLIC_SUPABASE_ANON_KEY: shape(PUBLIC_SUPABASE_ANON_KEY),
    },
  });
}
