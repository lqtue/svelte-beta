/**
 * Allmaps annotation-server lookups shared by the admin map routes.
 *
 * `lookup-allmaps-id`, `fetch-iiif-metadata` and `sync-georef` each had their
 * own copy of "hash the IIIF image URL, probe /images/<id>".
 */

import { deriveAllmapsId } from '$lib/iiif/allmapsId';

const ANNOTATION_SERVER = 'https://annotations.allmaps.org';
const PROBE_TIMEOUT_MS = 8000;

/** True when the Allmaps annotation server has a georeference for this image ID. */
export async function probeAllmapsAnnotation(
  allmapsId: string,
  method: 'GET' | 'HEAD' = 'GET'
): Promise<boolean> {
  try {
    const res = await fetch(`${ANNOTATION_SERVER}/images/${allmapsId}`, {
      method,
      headers: method === 'GET' ? { Accept: 'application/json, application/ld+json' } : undefined,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Derive the Allmaps image ID for a IIIF image service URL and check whether a
 * georeferenced annotation exists for it. Throws if the ID cannot be derived.
 */
export async function deriveAndProbe(
  iiifImage: string
): Promise<{ allmapsId: string; hasAnnotation: boolean }> {
  const allmapsId = await deriveAllmapsId(iiifImage);
  return { allmapsId, hasAnnotation: await probeAllmapsAnnotation(allmapsId) };
}

/**
 * Best-effort Allmaps image ID for a manifest.
 *
 * Strategy 1 (canonical): hash the IIIF image service URL and probe the
 * image-level endpoint. Strategy 2: ask the manifest-scoped lookup and derive
 * the ID from whatever it returns — legacy responses expose `/images/<id>`
 * directly, newer ones only `target.source.id`.
 */
export async function lookupAllmapsId(
  manifestUrl: string,
  imageServiceUrl?: string
): Promise<string | null> {
  if (imageServiceUrl) {
    try {
      const { allmapsId, hasAnnotation } = await deriveAndProbe(imageServiceUrl);
      if (hasAnnotation) return allmapsId;
    } catch {
      /* fall through to the manifest-scoped lookup */
    }
  }

  try {
    const res = await fetch(`${ANNOTATION_SERVER}/?url=${encodeURIComponent(manifestUrl)}`, {
      headers: { Accept: 'application/json, application/ld+json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items: unknown[] = data?.items ?? (data?.id ? [data] : []);
    if (!items.length) return null;
    const first = items[0] as Record<string, unknown>;

    // Legacy: id is already /images/<imageId>
    const idMatch = (first?.id as string | undefined)?.match(/\/images\/([^/]+)$/);
    if (idMatch) return idMatch[1];

    // Modern: derive the imageId from target.source.id
    const rawTarget = first?.target;
    const target = (Array.isArray(rawTarget) ? rawTarget[0] : rawTarget) as
      Record<string, any> | undefined;
    const sourceId =
      (typeof target?.source === 'string' ? target.source : target?.source?.id) ??
      target?.source?.['@id'];
    if (typeof sourceId === 'string' && sourceId) return await deriveAllmapsId(sourceId);
    return null;
  } catch {
    return null;
  }
}
