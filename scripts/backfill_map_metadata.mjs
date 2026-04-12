#!/usr/bin/env node
// Backfill map metadata from Allmaps annotations + IIIF manifests.
//
// For each map with an allmaps_id:
//   1. Fetch Allmaps annotation → extract IIIF image service URL + manifest URL
//   2. Fetch IIIF manifest → extract title, creator, date, rights, thumbnail
//   3. Determine source_type + collection from URL patterns
//   4. Update maps table: iiif_image, iiif_manifest, thumbnail, source_type,
//      collection, original_title, creator, year_label, rights
//   5. Insert into map_iiif_sources as primary source
//
// Usage: node scripts/backfill_map_metadata.mjs [--dry-run] [--map-id <uuid>]

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---- load env ----
const envPath = resolve(process.cwd(), '.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
    .filter(([k]) => k)
);

const SUPABASE_URL = env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = env.SUPABASE_SERVICE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const SPECIFIC_MAP = process.argv.includes('--map-id')
  ? process.argv[process.argv.indexOf('--map-id') + 1]
  : null;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

// ---- helpers ----

function supabaseHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: supabaseHeaders() });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function sbPatch(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}: ${await r.text()}`);
}

async function sbPost(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${await r.text()}`);
}

async function fetchJson(url) {
  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/json, application/ld+json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

// ---- source detection ----

function detectSource(imageServiceUrl) {
  const u = imageServiceUrl.toLowerCase();
  if (u.includes('gallica.bnf.fr'))    return { source_type: 'bnf',    collection: 'BnF Gallica' };
  if (u.includes('archive.org'))       return { source_type: 'ia',     collection: 'Internet Archive' };
  if (u.includes('efeo'))              return { source_type: 'efeo',   collection: 'EFEO' };
  if (u.includes('davidrumsey.com'))   return { source_type: 'rumsey', collection: 'David Rumsey' };
  if (u.includes('iiif.io') || u.includes('localhost')) return { source_type: 'self', collection: null };
  return { source_type: 'other', collection: null };
}

// ---- IIIF manifest parsing (inline, minimal) ----

function v3Label(label) {
  if (!label || typeof label !== 'object') return undefined;
  const keys = Object.keys(label);
  const val = label['fr'] ?? label['vi'] ?? label['none'] ?? label[keys[0]];
  return val?.[0];
}

function v2MetadataValue(metadata, key) {
  if (!metadata) return undefined;
  for (const entry of metadata) {
    const labelStr = typeof entry.label === 'string' ? entry.label : Object.values(entry.label ?? {})[0]?.[0] ?? '';
    if (labelStr.toLowerCase().includes(key.toLowerCase())) {
      if (typeof entry.value === 'string') return entry.value;
      // Array of {"@value": "..."} objects (BnF v2 format field)
      if (Array.isArray(entry.value)) {
        const first = entry.value[0];
        return typeof first === 'string' ? first : (first?.['@value'] ?? Object.values(first ?? {})[0]);
      }
      return Object.values(entry.value ?? {})[0]?.[0];
    }
  }
}

function v3MetadataValue(metadata, key) {
  if (!metadata) return undefined;
  const entry = metadata.find(m => (v3Label(m.label) ?? '').toLowerCase().includes(key));
  return entry ? v3Label(entry.value) : undefined;
}

function parseThumbnail(manifest, isV3) {
  if (isV3) {
    const t = manifest.thumbnail;
    return Array.isArray(t) ? t[0]?.id : t?.id;
  }
  const t = manifest.thumbnail;
  return typeof t === 'string' ? t : t?.['@id'];
}

function parseManifest(manifest) {
  const ctx = Array.isArray(manifest['@context']) ? manifest['@context'].join(' ') : (manifest['@context'] ?? '');
  const isV3 = ctx.includes('presentation/3') || manifest.type === 'Manifest';

  if (isV3) {
    return {
      title:     v3Label(manifest.label),
      creator:   v3MetadataValue(manifest.metadata, 'creator') ?? v3MetadataValue(manifest.metadata, 'author'),
      date:      v3MetadataValue(manifest.metadata, 'date') ?? v3MetadataValue(manifest.metadata, 'year'),
      rights:    manifest.rights ?? v3MetadataValue(manifest.metadata, 'rights'),
      thumbnail: parseThumbnail(manifest, true),
    };
  }

  // v2: manifest.label = shelf mark, manifest.description = actual title
  const labelRaw = manifest.label;
  const labelStr = typeof labelRaw === 'string' ? labelRaw : Object.values(labelRaw ?? {})[0]?.[0];
  const title = manifest.description || v2MetadataValue(manifest.metadata, 'title') || labelStr;
  const shelfmark = v2MetadataValue(manifest.metadata, 'shelfmark') || labelStr;
  const formatVal = v2MetadataValue(manifest.metadata, 'format');
  const physicalDescription = formatVal && !formatVal.startsWith('image/') && !formatVal.startsWith('Nombre')
    ? formatVal : undefined;
  const related = manifest.related;
  const sourceUrl = typeof related === 'string' ? related : Array.isArray(related) ? related[0] : undefined;
  return {
    title:               title || undefined,
    shelfmark:           shelfmark || undefined,
    creator:             v2MetadataValue(manifest.metadata, 'creator') ?? v2MetadataValue(manifest.metadata, 'author'),
    date:                v2MetadataValue(manifest.metadata, 'date') ?? v2MetadataValue(manifest.metadata, 'year'),
    language:            v2MetadataValue(manifest.metadata, 'language'),
    rights:              manifest.license ?? v2MetadataValue(manifest.metadata, 'rights'),
    attribution:         manifest.attribution ?? v2MetadataValue(manifest.metadata, 'repository'),
    sourceUrl,
    physicalDescription,
    thumbnail:           parseThumbnail(manifest, false),
  };
}

// ---- IIIF thumbnail from image service ----

function buildIIIFThumbnail(imageServiceUrl) {
  const base = imageServiceUrl.endsWith('/') ? imageServiceUrl.slice(0, -1) : imageServiceUrl;
  return `${base}/full/300,/0/default.jpg`;
}

// ---- extract manifest URL from Allmaps annotation ----

function extractManifestUrl(annotation) {
  try {
    const source = annotation?.items?.[0]?.target?.source;
    const partOf = source?.partOf ?? [];
    // Walk partOf chain looking for a Manifest
    for (const part of partOf) {
      if (part.type === 'Manifest' && part.id) return part.id;
      // nested partOf
      for (const nested of part.partOf ?? []) {
        if (nested.type === 'Manifest' && nested.id) return nested.id;
      }
    }
  } catch { /* ignore */ }
  return null;
}

// ---- main ----

async function processMap(map) {
  const { id, name, allmaps_id } = map;
  console.log(`\n[${name}] (${allmaps_id})`);

  // 1. Fetch Allmaps annotation
  const annotationUrl = `https://annotations.allmaps.org/images/${allmaps_id}`;
  const annotation = await fetchJson(annotationUrl);
  if (!annotation?.items?.length) {
    console.log('  ✗ No annotation found');
    return null;
  }

  const imageServiceUrl = annotation.items[0]?.target?.source?.id;
  if (!imageServiceUrl) {
    console.log('  ✗ No IIIF image service URL in annotation');
    return null;
  }
  console.log(`  IIIF image: ${imageServiceUrl}`);

  // 2. Detect source
  const { source_type, collection } = detectSource(imageServiceUrl);
  console.log(`  Source: ${source_type} / ${collection}`);

  // 3. Try to get manifest URL from annotation, then fetch manifest
  const manifestUrl = extractManifestUrl(annotation);
  console.log(`  Manifest: ${manifestUrl ?? '(none in annotation)'}`);

  let manifestMeta = {};
  if (manifestUrl) {
    const manifest = await fetchJson(manifestUrl);
    if (manifest) {
      manifestMeta = parseManifest(manifest);
      console.log(`  Title: ${manifestMeta.title}`);
      console.log(`  Creator: ${manifestMeta.creator}`);
      console.log(`  Date: ${manifestMeta.date}`);
    }
  }

  // 4. Build thumbnail
  // Prefer IIIF image service thumbnail over manifest thumbnail (avoids IA _thumb variants)
  const thumbnail = buildIIIFThumbnail(imageServiceUrl);
  console.log(`  Thumbnail: ${thumbnail}`);

  // 5. Build update payload
  // Skip year_label if it looks like a timestamp (IA upload date, not historical date)
  const isHistoricalDate = manifestMeta.date &&
    /^\d{3,4}(-\d{2}(-\d{2})?)?$/.test(manifestMeta.date.trim());

  const mapUpdate = {
    iiif_image:    imageServiceUrl,
    iiif_manifest: manifestUrl ?? null,
    thumbnail,
    source_type,
    collection,
    ...(manifestMeta.title               && { original_title:       manifestMeta.title }),
    ...(manifestMeta.shelfmark           && { shelfmark:            manifestMeta.shelfmark }),
    ...(manifestMeta.creator             && { creator:              manifestMeta.creator }),
    ...(isHistoricalDate                 && { year_label:           manifestMeta.date }),
    ...(manifestMeta.language            && { language:             manifestMeta.language }),
    ...(manifestMeta.rights              && { rights:               manifestMeta.rights }),
    ...(manifestMeta.physicalDescription && { physical_description: manifestMeta.physicalDescription }),
    ...(manifestMeta.sourceUrl           && { source_url:           manifestMeta.sourceUrl }),
  };

  const sourceRow = {
    map_id:        id,
    label:         collection ?? source_type,
    source_type,
    iiif_manifest: manifestUrl ?? null,
    iiif_image:    imageServiceUrl,
    is_primary:    true,
    sort_order:    0,
  };

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would update maps:', JSON.stringify(mapUpdate, null, 2));
    console.log('  [DRY RUN] Would insert map_iiif_sources:', JSON.stringify(sourceRow, null, 2));
    return mapUpdate;
  }

  // Update maps row
  await sbPatch(`/maps?id=eq.${id}`, mapUpdate);

  // Upsert into map_iiif_sources (skip if already exists for this map)
  const existing = await sbGet(`/map_iiif_sources?map_id=eq.${id}&is_primary=eq.true`);
  if (existing.length === 0) {
    await sbPost('/map_iiif_sources', sourceRow);
    console.log('  ✓ Inserted map_iiif_sources row');
  } else {
    await sbPatch(`/map_iiif_sources?map_id=eq.${id}&is_primary=eq.true`, {
      label:         sourceRow.label,
      source_type:   sourceRow.source_type,
      iiif_manifest: sourceRow.iiif_manifest,
      iiif_image:    sourceRow.iiif_image,
    });
    console.log('  ✓ Updated existing map_iiif_sources row');
  }

  console.log('  ✓ Updated maps row');
  return mapUpdate;
}

async function main() {
  console.log(`Backfilling map metadata${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  let maps;
  if (SPECIFIC_MAP) {
    maps = await sbGet(`/maps?id=eq.${SPECIFIC_MAP}&select=id,name,allmaps_id`);
  } else {
    maps = await sbGet('/maps?select=id,name,allmaps_id&order=year.asc');
  }

  console.log(`Found ${maps.length} maps to process`);

  let success = 0, failed = 0;
  for (const map of maps) {
    try {
      const result = await processMap(map);
      if (result) success++;
      else failed++;
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
      failed++;
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nDone: ${success} updated, ${failed} failed`);
}

main().catch(err => { console.error(err); process.exit(1); });
