import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/auth';
import { deriveAndProbe } from '$lib/server/allmaps';

/**
 * POST { iiifImage } — given a IIIF image service URL, derive the Allmaps
 * image ID and confirm a georeferenced annotation exists on the Allmaps
 * annotation server. Returns { allmapsId, hasAnnotation }.
 *
 * Allmaps image IDs are the first 16 chars of the SHA-1 of the IIIF image
 * service URL (per @allmaps/id).
 */
export const POST: RequestHandler = async ({ locals, request }) => {
  await requireRole(locals);

  const { iiifImage } = (await request.json()) as { iiifImage?: string };
  if (!iiifImage) throw error(400, 'iiifImage is required');

  try {
    return json(await deriveAndProbe(iiifImage));
  } catch (e) {
    throw error(500, `Could not derive Allmaps ID: ${(e as Error).message}`);
  }
};
