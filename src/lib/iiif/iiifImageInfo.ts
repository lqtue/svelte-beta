// ---- IIIF image info resolver ----

import { annotationUrlForSource } from '$lib/shell/warpedOverlay';

/**
 * Resolve just the IIIF info.json URL from an Allmaps annotation ID.
 * Used by IIIF-canvas tools (label, trace, digitalize) to feed `ImageShell`.
 */
export async function resolveIiifInfoUrl(allmapsId: string): Promise<string | null> {
  try {
    const res = await fetch(annotationUrlForSource(allmapsId));
    if (!res.ok) throw new Error(`Allmaps fetch failed: ${res.status}`);
    const annotation = await res.json();
    const sourceId = annotation.items?.[0]?.target?.source?.id;
    if (!sourceId) throw new Error('No source ID in annotation');
    return `${sourceId}/info.json`;
  } catch (err) {
    console.error('[resolveIiifInfoUrl] failed:', err);
    return null;
  }
}
