/**
 * Supabase Storage upserts, via the REST API.
 *
 * The JS client is unreliable for text/JSON payloads in server runtimes, so
 * both the annotation-GCP editor and the R2 mirror POST directly with
 * `x-upsert: true`. This is the single copy of that request.
 */

import { error } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';

/**
 * Write `obj` as pretty-printed JSON to `bucket/path`, creating or overwriting.
 * Returns the public URL of the stored object. Throws 500 on failure.
 */
export async function uploadJson(bucket: string, path: string, obj: unknown): Promise<string> {
  const url = `${PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(obj, null, 2),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => String(res.status));
    console.error('[storage] upload failed:', res.status, errText);
    throw error(500, `Storage upload failed (${res.status})`);
  }

  return `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
