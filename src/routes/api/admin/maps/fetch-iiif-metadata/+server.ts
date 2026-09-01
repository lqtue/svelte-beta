import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/auth';
import { lookupAllmapsId } from '$lib/server/allmaps';
import { fetchIIIFManifest } from '$lib/data/maps/iiifManifest';

/** POST — fetch and parse a IIIF manifest, return normalised metadata + Allmaps check */
export const POST: RequestHandler = async ({ locals, request }) => {
  await requireRole(locals);

  const body = await request.json();
  const { manifestUrl } = body as { manifestUrl?: string };

  if (!manifestUrl) throw error(400, 'manifestUrl is required');

  // Fetch manifest first so we can pass the image service URL to the
  // Allmaps lookup (it's the canonical key — the manifest URL alone may not
  // resolve on the annotation server).
  const meta = await fetchIIIFManifest(manifestUrl);
  const allmapsId = await lookupAllmapsId(manifestUrl, meta?.imageServiceUrl);

  return json({ ...(meta ?? {}), allmapsId, fetchFailed: meta === null });
};
