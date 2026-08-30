/**
 * iiifSource.ts — one resolution path from a contribute-tool map record to its
 * IIIF `info.json`. Prefers the `maps.iiif_image` column (direct and reliable,
 * and the only thing that works for R2-mirrored maps); falls back to walking
 * the Allmaps annotation.
 *
 * Lives here for now; belongs in `$lib/maps` once that module owns tool types.
 */

import { resolveIiifInfoUrl } from '$lib/iiif/iiifImageInfo';

export type IiifSourceRef = {
  iiifImage?: string | null;
  allmapsId?: string | null;
};

export async function resolveMapIiifInfoUrl(map: IiifSourceRef | null): Promise<string | null> {
  if (!map) return null;
  if (map.iiifImage) return `${map.iiifImage}/info.json`;
  if (!map.allmapsId) return null;
  return resolveIiifInfoUrl(map.allmapsId);
}
