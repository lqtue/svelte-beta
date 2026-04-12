// ---- IIIF manifest parser ----
// Supports IIIF Presentation API v2 and v3.
// Returns normalised metadata for the maps module.

import type { IIIFManifestMeta } from './types';

// ---- v3 helpers ----

function v3Label(label: unknown): string | undefined {
  if (!label || typeof label !== 'object') return undefined;
  const l = label as Record<string, string[]>;
  const keys = Object.keys(l);
  if (!keys.length) return undefined;
  // prefer 'fr' or 'vi', fall back to 'none' then first key
  const val = l['fr'] ?? l['vi'] ?? l['none'] ?? l[keys[0]];
  return val?.[0];
}

function v3MetadataValue(manifest: Record<string, unknown>, labelKey: string): string | undefined {
  const metadata = manifest['metadata'] as Array<{ label: unknown; value: unknown }> | undefined;
  if (!metadata) return undefined;
  const entry = metadata.find((m) => {
    const text = v3Label(m.label)?.toLowerCase() ?? '';
    return text.includes(labelKey.toLowerCase());
  });
  return entry ? v3Label(entry.value) : undefined;
}

// ---- v2 helpers ----

function v2MetadataValue(manifest: Record<string, unknown>, labelKey: string): string | undefined {
  const metadata = manifest['metadata'] as Array<{ label: unknown; value: unknown }> | undefined;
  if (!metadata) return undefined;
  for (const entry of metadata) {
    const labelStr = typeof entry.label === 'string'
      ? entry.label
      : (Object.values((entry.label as Record<string, string[]>) ?? {})[0]?.[0] ?? '');
    if (labelStr.toLowerCase().includes(labelKey.toLowerCase())) {
      if (typeof entry.value === 'string') return entry.value || undefined;
      // BnF v2 array-of-objects: [{"@value": "..."}]
      if (Array.isArray(entry.value)) {
        const first = (entry.value as unknown[])[0];
        if (typeof first === 'string') return first || undefined;
        const v = (first as Record<string, unknown>)?.['@value'];
        return typeof v === 'string' ? v || undefined : undefined;
      }
      const val = Object.values((entry.value as Record<string, string[]>) ?? {})[0]?.[0];
      return val || undefined;
    }
  }
  return undefined;
}

// ---- image service extraction ----

function extractImageServiceFromV3(manifest: Record<string, unknown>): string | undefined {
  try {
    type ArrRec = Array<Record<string, unknown>>;
    const items = manifest['items'] as ArrRec | undefined;
    const canvas = items?.[0] as Record<string, unknown> | undefined;
    const canvasItems = canvas?.['items'] as ArrRec | undefined;
    const annoPage = canvasItems?.[0] as Record<string, unknown> | undefined;
    const annoPageItems = annoPage?.['items'] as ArrRec | undefined;
    const anno = annoPageItems?.[0] as Record<string, unknown> | undefined;
    const annoBody = anno?.['body'] as Record<string, unknown> | undefined;
    const service = annoBody?.['service'] as ArrRec | Record<string, unknown> | undefined;
    if (Array.isArray(service)) return (service[0]?.['id'] ?? service[0]?.['@id']) as string | undefined;
    return (service?.['id'] ?? service?.['@id']) as string | undefined;
  } catch {
    return undefined;
  }
}

function extractImageServiceFromV2(manifest: Record<string, unknown>): string | undefined {
  try {
    const sequences = manifest['sequences'] as Array<Record<string, unknown>> | undefined;
    const canvas = (sequences?.[0]?.['canvases'] as Array<Record<string, unknown>>)?.[0];
    const image = (canvas?.['images'] as Array<Record<string, unknown>>)?.[0];
    const resource = image?.['resource'] as Record<string, unknown> | undefined;
    const service = resource?.['service'] as Record<string, unknown> | undefined;
    return (service?.['@id'] ?? resource?.['@id']) as string | undefined;
  } catch {
    return undefined;
  }
}

// ---- thumbnail extraction ----

function extractThumbnail(manifest: Record<string, unknown>, version: 2 | 3): string | undefined {
  if (version === 3) {
    const thumb = manifest['thumbnail'] as Array<Record<string, unknown>> | Record<string, unknown> | undefined;
    if (Array.isArray(thumb)) return thumb[0]?.['id'] as string | undefined;
    return thumb?.['id'] as string | undefined;
  }
  // v2
  const thumb = manifest['thumbnail'] as Record<string, unknown> | string | undefined;
  if (typeof thumb === 'string') return thumb;
  return thumb?.['@id'] as string | undefined;
}

// ---- public API ----

/** Parse a raw IIIF manifest object into normalised metadata. */
export function parseIIIFManifest(manifest: Record<string, unknown>): IIIFManifestMeta {
  const context = manifest['@context'] as string | string[] | undefined;
  const contextStr = Array.isArray(context) ? context.join(' ') : (context ?? '');
  const isV3 = contextStr.includes('presentation/3') || manifest['type'] === 'Manifest';

  if (isV3) {
    return {
      manifestVersion: 3,
      title: v3Label(manifest['label']),
      creator: v3MetadataValue(manifest, 'creator')
        ?? v3MetadataValue(manifest, 'author')
        ?? v3MetadataValue(manifest, 'cartographer'),
      date: v3MetadataValue(manifest, 'date')
        ?? v3MetadataValue(manifest, 'year')
        ?? v3MetadataValue(manifest, 'created'),
      language: (() => {
        const langs = manifest['language'] as string[] | string | undefined;
        return Array.isArray(langs) ? langs[0] : langs;
      })(),
      rights: (manifest['rights'] as string | undefined)
        ?? v3MetadataValue(manifest, 'rights')
        ?? v3MetadataValue(manifest, 'license'),
      thumbnail: extractThumbnail(manifest, 3),
      imageServiceUrl: extractImageServiceFromV3(manifest),
    };
  }

  // v2
  // In BnF IIIF v2: manifest.label = shelf mark, manifest.description = actual title.
  // metadata["Title"] is also the actual title; metadata["Shelfmark"] has the full shelf mark.
  const labelRaw = manifest['label'] as string | Record<string, string[]> | undefined;
  const labelStr = typeof labelRaw === 'string' ? labelRaw : Object.values(labelRaw ?? {})[0]?.[0];

  // Actual title: prefer manifest.description or metadata["Title"], fall back to label
  const descRaw = manifest['description'] as string | undefined;
  const metaTitle = v2MetadataValue(manifest, 'title');
  const title = descRaw || metaTitle || labelStr;

  // Shelfmark: metadata["Shelfmark"] or label (if it looks like a call number, not a title)
  const metaShelfmark = v2MetadataValue(manifest, 'shelfmark');
  const shelfmark = metaShelfmark || labelStr;

  // Physical format — first array value that looks like dimensions (not "image/jpeg" or count)
  const formatRaw = v2MetadataValue(manifest, 'format');
  const physicalDescription = formatRaw && !formatRaw.startsWith('image/') && !formatRaw.startsWith('Nombre')
    ? formatRaw
    : undefined;

  // Canonical source URL from manifest.related
  const related = manifest['related'] as string | string[] | undefined;
  const sourceUrl = typeof related === 'string' ? related : Array.isArray(related) ? related[0] : undefined;

  return {
    manifestVersion: 2,
    title: title || undefined,
    shelfmark: shelfmark || undefined,
    creator: v2MetadataValue(manifest, 'creator')
      ?? v2MetadataValue(manifest, 'author')
      ?? v2MetadataValue(manifest, 'cartographer'),
    date: v2MetadataValue(manifest, 'date')
      ?? v2MetadataValue(manifest, 'year')
      ?? v2MetadataValue(manifest, 'created'),
    language: v2MetadataValue(manifest, 'language'),
    rights: (manifest['license'] as string | undefined)
      ?? v2MetadataValue(manifest, 'rights')
      ?? v2MetadataValue(manifest, 'license'),
    attribution: (manifest['attribution'] as string | undefined)
      ?? v2MetadataValue(manifest, 'repository'),
    sourceUrl,
    physicalDescription,
    thumbnail: extractThumbnail(manifest, 2),
    imageServiceUrl: extractImageServiceFromV2(manifest),
  };
}

/** Fetch and parse a IIIF manifest from a URL. Returns null on failure. */
export async function fetchIIIFManifest(manifestUrl: string): Promise<IIIFManifestMeta | null> {
  try {
    const res = await fetch(manifestUrl, {
      headers: { Accept: 'application/json, application/ld+json' },
    });
    if (!res.ok) return null;
    const raw = await res.json();
    return parseIIIFManifest(raw);
  } catch {
    return null;
  }
}
