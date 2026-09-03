/**
 * iiifSource.ts — one resolution path from a contribute-tool map record to its
 * IIIF `info.json`. Prefers the `maps.iiif_image` column (direct and reliable,
 * and the only thing that works for R2-mirrored maps); falls back to walking
 * the Allmaps annotation.
 *
 * Lives here for now; belongs in `$lib/data/maps` once that module owns tool types.
 */

import { annotationUrlForSource } from '$lib/core/iiif/annotationUrl';

export type IiifSourceRef = {
  iiifImage?: string | null;
  allmapsId?: string | null;
};

export async function resolveMapIiifInfoUrl(map: IiifSourceRef | null): Promise<string | null> {
  if (!map) return null;
  if (map.iiifImage) return `${map.iiifImage}/info.json`;
  if (!map.allmapsId) return null;

  // Fallback: walk the annotation for the image service it targets.
  try {
    const res = await fetch(annotationUrlForSource(map.allmapsId));
    if (!res.ok) throw new Error(`Allmaps fetch failed: ${res.status}`);
    const annotation = await res.json();
    const sourceId = annotation.items?.[0]?.target?.source?.id;
    if (!sourceId) throw new Error('No source ID in annotation');
    return `${sourceId}/info.json`;
  } catch (err) {
    console.error('[resolveMapIiifInfoUrl] annotation walk failed:', err);
    return null;
  }
}
