#!/usr/bin/env node
// Apply source metadata from map_sources_ia.json to the database.
//
// Handles:
// - BnF manifest URLs in source_url → fetch manifest metadata, derive Gallica page URL,
//   add BnF IIIF as secondary source in map_iiif_sources
// - Humazur / UT Austin / MSU / LOC → set source_type + collection from URL patterns
// - Multiple comma-separated URLs → primary = first, store all in source_url
// - Name field accidentally containing URLs (1942 map) → restore correct name
//
// Usage: node scripts/apply_map_sources.mjs [--dry-run]

import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
    .filter(([k]) => k)
);

const SUPABASE_URL = env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = env.SUPABASE_SERVICE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function sbPatch(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'PATCH',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
               'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}: ${await r.text()}`);
}

async function sbPost(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
               'Content-Type': 'application/json', Prefer: 'return=minimal' },
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
  } catch { return null; }
}

// ---- source detection ----

function detectSource(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('gallica.bnf.fr') || u.includes('/12148/'))
    return { source_type: 'bnf', collection: 'BnF Gallica' };
  if (u.includes('humazur.univ-cotedazur.fr'))
    return { source_type: 'other', collection: 'HumaZur, Université Côte d\'Azur' };
  if (u.includes('maps.lib.utexas.edu'))
    return { source_type: 'other', collection: 'Perry-Castañeda Library Map Collection, UT Austin' };
  if (u.includes('vietnamproject.archives.msu.edu'))
    return { source_type: 'other', collection: 'MSU Vietnam Project Archives' };
  if (u.includes('blogs.loc.gov') || u.includes('loc.gov'))
    return { source_type: 'other', collection: 'Library of Congress' };
  if (u.includes('geographicus.com'))
    return { source_type: 'other', collection: 'Geographicus Rare & Antique Maps' };
  if (u.includes('virtual-saigon.net'))
    return { source_type: 'other', collection: 'Virtual Saigon' };
  if (u.includes('wikipedia.org'))
    return { source_type: 'other', collection: 'Wikimedia Commons' };
  return { source_type: 'other', collection: null };
}

// ---- BnF manifest helpers ----

function isBnfManifest(url) {
  return /gallica\.bnf\.fr\/iiif\/.*\/manifest\.json/.test(url);
}

// manifest URL → canonical Gallica page URL (strip folio if needed for multi-folio docs)
function bnfPageUrl(manifestUrl) {
  // https://gallica.bnf.fr/iiif/ark:/12148/xxx/manifest.json → https://gallica.bnf.fr/ark:/12148/xxx
  return manifestUrl.replace(/\/iiif\/(ark:\/[^/]+(?:\/[^/]+)?)\/manifest\.json.*/, '/$1');
}

function v3Label(label) {
  if (!label || typeof label !== 'object') return undefined;
  const keys = Object.keys(label);
  const val = label['fr'] ?? label['vi'] ?? label['none'] ?? label[keys[0]];
  return val?.[0];
}
function v2Meta(metadata, key) {
  if (!metadata) return undefined;
  for (const e of metadata) {
    const l = typeof e.label === 'string' ? e.label : Object.values(e.label ?? {})[0]?.[0] ?? '';
    if (l.toLowerCase().includes(key)) {
      if (typeof e.value === 'string') return e.value;
      // Array of {"@value": "..."} objects (BnF v2 format field)
      if (Array.isArray(e.value)) {
        const first = e.value[0];
        return typeof first === 'string' ? first : (first?.['@value'] ?? Object.values(first ?? {})[0]);
      }
      return Object.values(e.value ?? {})[0]?.[0];
    }
  }
}
function v3Meta(metadata, key) {
  if (!metadata) return undefined;
  const e = metadata.find(m => (v3Label(m.label) ?? '').toLowerCase().includes(key));
  return e ? v3Label(e.value) : undefined;
}

function parseManifest(m) {
  const ctx = Array.isArray(m['@context']) ? m['@context'].join(' ') : (m['@context'] ?? '');
  const isV3 = ctx.includes('presentation/3') || m.type === 'Manifest';
  if (isV3) {
    const date = v3Meta(m.metadata, 'date') ?? v3Meta(m.metadata, 'year');
    const isHistorical = date && /^\d{3,4}(-\d{2}(-\d{2})?)?$/.test(date.trim());
    return {
      title:    v3Label(m.label),
      shelfmark: undefined,
      creator:  v3Meta(m.metadata, 'creator') ?? v3Meta(m.metadata, 'author'),
      date:     isHistorical ? date : undefined,
      language: v3Meta(m.metadata, 'language'),
      rights:   m.rights ?? v3Meta(m.metadata, 'rights'),
      attribution: v3Meta(m.metadata, 'repository'),
      sourceUrl: undefined,
      physicalDescription: undefined,
      thumbnail: (() => { const t = m.thumbnail; return Array.isArray(t) ? t[0]?.id : t?.id; })(),
    };
  }
  // v2: manifest.label = shelf mark, manifest.description = actual title
  const labelRaw = m.label;
  const labelStr = typeof labelRaw === 'string' ? labelRaw : Object.values(labelRaw ?? {})[0]?.[0];
  const title = m.description || v2Meta(m.metadata, 'title') || labelStr;
  const shelfmark = v2Meta(m.metadata, 'shelfmark') || labelStr;
  const date = v2Meta(m.metadata, 'date') ?? v2Meta(m.metadata, 'year');
  const isHistorical = date && /^\d{3,4}(-\d{2}(-\d{2})?)?$/.test(date.trim());
  const formatVal = v2Meta(m.metadata, 'format');
  const physicalDescription = formatVal && !formatVal.startsWith('image/') && !formatVal.startsWith('Nombre')
    ? formatVal : undefined;
  const related = m.related;
  const sourceUrl = typeof related === 'string' ? related : Array.isArray(related) ? related[0] : undefined;
  return {
    title:    title || undefined,
    shelfmark: shelfmark || undefined,
    creator:  v2Meta(m.metadata, 'creator') ?? v2Meta(m.metadata, 'author'),
    date:     isHistorical ? date : undefined,
    language: v2Meta(m.metadata, 'language'),
    rights:   m.license ?? v2Meta(m.metadata, 'rights'),
    attribution: m.attribution ?? v2Meta(m.metadata, 'repository'),
    sourceUrl,
    physicalDescription,
    thumbnail: (() => { const t = m.thumbnail; return typeof t === 'string' ? t : t?.['@id']; })(),
  };
}

function extractImageService(manifest) {
  try {
    // v3
    const items = manifest.items;
    const canvas = items?.[0];
    const annoPage = canvas?.items?.[0];
    const anno = annoPage?.items?.[0];
    const body = anno?.body;
    const svc = body?.service;
    if (svc) {
      if (Array.isArray(svc)) return svc[0]?.id ?? svc[0]?.['@id'];
      return svc.id ?? svc['@id'];
    }
  } catch {}
  try {
    // v2
    const seq = manifest.sequences?.[0];
    const canvas = seq?.canvases?.[0];
    const image = canvas?.images?.[0];
    const resource = image?.resource;
    const svc = resource?.service;
    return svc?.['@id'] ?? resource?.['@id'];
  } catch {}
  return null;
}

// ---- process one entry ----

async function processEntry(entry) {
  const { id, name: rawName, notes } = entry;
  let { source_url: rawSourceUrl, source_type, collection } = entry;

  console.log(`\n[${rawName.slice(0, 60)}]`);

  // ---- detect name-field corruption (URLs pasted into name) ----
  let correctName = null;
  let nameUrls = [];
  if (rawName.startsWith('http')) {
    // User pasted URLs into name. Restore correct name from DB.
    const current = await sbGet(`/maps?id=eq.${id}&select=name`);
    correctName = current[0]?.name;
    nameUrls = rawName.split(',').map(u => u.trim()).filter(u => u.startsWith('http'));
    console.log(`  ⚠ Name field corrupted — actual name: "${correctName}"`);
    console.log(`  URLs found in name: ${nameUrls.join(', ')}`);
    // Use these as source_url if none provided
    if (!rawSourceUrl) rawSourceUrl = nameUrls.join(', ');
  }

  // ---- split comma-separated URLs ----
  const allUrls = (rawSourceUrl || '').split(',').map(u => u.trim()).filter(Boolean);
  const primaryUrl = allUrls[0] || '';

  if (!primaryUrl) {
    console.log('  ⚠ No source URL — skipping metadata fetch, will still update source_type if set');
  }

  // ---- detect source from primary URL ----
  const detected = detectSource(primaryUrl);
  const finalSourceType = source_type !== 'ia' ? source_type : detected.source_type;
  const finalCollection  = collection !== 'Internet Archive' ? collection : (detected.collection ?? collection);

  console.log(`  source_type: ${finalSourceType} | collection: ${finalCollection}`);

  // ---- build update payload ----
  const update = {
    source_type: finalSourceType,
    collection:  finalCollection,
  };

  // Restore corrupted name
  if (correctName) update.name = correctName;

  // Use canonical page URL (not manifest URL) as source_url
  let canonicalSourceUrl = primaryUrl;

  // ---- fetch BnF manifests ----
  const bnfManifests = allUrls.filter(u => isBnfManifest(u));
  const bnfPageUrls  = allUrls
    .filter(u => u.includes('gallica.bnf.fr') && !u.includes('/iiif/'))
    .map(u => u.replace(/[?#].*/, '')); // strip query params

  // Also treat bare BnF ark URLs with query params
  const bnfArks = allUrls
    .filter(u => u.includes('gallica.bnf.fr/ark'))
    .map(u => u.replace(/[?#].*/, ''));

  // Derive canonical Gallica pages
  const gallicaPages = [
    ...bnfManifests.map(bnfPageUrl),
    ...bnfPageUrls,
    ...bnfArks,
  ].filter((v, i, a) => a.indexOf(v) === i); // unique

  if (gallicaPages.length > 0) {
    canonicalSourceUrl = gallicaPages[0];
    console.log(`  Gallica page: ${canonicalSourceUrl}`);
  }

  update.source_url = canonicalSourceUrl || null;

  // Store all URLs in notes if there are multiple (and original notes not already set)
  if (allUrls.length > 1 && !notes) {
    update.original_title = update.original_title ?? undefined; // don't overwrite
  }

  // For UT Austin maps, extract useful metadata from notes
  if (notes && finalCollection?.includes('UT Austin')) {
    // e.g. "Ha Noi [Hanoi] 1:12,500, Edition 3, Series L909, National Imagery and Mapping Agency, 1968"
    const creatorMatch = notes.match(/National Imagery and Mapping Agency|U\.S\. Army Map Service/i);
    if (creatorMatch) update.creator = creatorMatch[0];
    if (!update.year_label) {
      const yearMatch = notes.match(/\b(19\d{2})\b/);
      if (yearMatch) update.year_label = yearMatch[1];
    }
    // Strip scale, edition, series, year, and file size from the end
    // e.g. "Ha Noi [Hanoi] 1:12,500, Edition 3, ..." → "Ha Noi [Hanoi]"
    update.original_title = notes
      .replace(/\s+1:\d[\d,]+.*/, '')  // strip scale + everything after
      .replace(/,\s*$/, '')             // strip trailing comma
      .replace(/\s*\(.*?\)\s*$/, '')    // strip trailing parenthetical
      .trim();
  }

  // ---- fetch BnF manifest metadata ----
  let bnfMeta = null;
  let bnfIiifImage = null;

  // Try first manifest URL, or construct from gallica page
  // Gallica IIIF manifest requires /iiif/ prefix: gallica.bnf.fr/iiif/ark:.../manifest.json
  const manifestToFetch = bnfManifests[0] ||
    (gallicaPages[0]
      ? gallicaPages[0].replace(/\/f\d+$/, '').replace(
          /gallica\.bnf\.fr\/(ark:)/,
          'gallica.bnf.fr/iiif/$1'
        ) + '/manifest.json'
      : null);

  if (manifestToFetch) {
    console.log(`  Fetching manifest: ${manifestToFetch}`);
    const manifest = await fetchJson(manifestToFetch);
    if (manifest) {
      bnfMeta = parseManifest(manifest);
      bnfIiifImage = extractImageService(manifest);
      console.log(`  title: ${bnfMeta.title}`);
      console.log(`  shelfmark: ${bnfMeta.shelfmark}`);
      console.log(`  creator: ${bnfMeta.creator}`);
      console.log(`  date: ${bnfMeta.date}`);
      console.log(`  language: ${bnfMeta.language}`);
      console.log(`  physical: ${bnfMeta.physicalDescription}`);
      console.log(`  iiif_image: ${bnfIiifImage}`);

      if (bnfMeta.title)               update.original_title      = bnfMeta.title;
      if (bnfMeta.shelfmark)           update.shelfmark           = bnfMeta.shelfmark;
      if (bnfMeta.creator)             update.creator             = bnfMeta.creator;
      if (bnfMeta.date)                update.year_label          = bnfMeta.date;
      if (bnfMeta.language)            update.language            = bnfMeta.language;
      if (bnfMeta.rights)              update.rights              = bnfMeta.rights;
      if (bnfMeta.physicalDescription) update.physical_description = bnfMeta.physicalDescription;
      // Use manifest.related as source_url if we don't already have a canonical one
      if (bnfMeta.sourceUrl && !update.source_url) update.source_url = bnfMeta.sourceUrl;
    }
  }

  // For HumaZur maps — no machine-readable API, just record the URL
  const humazurUrls = allUrls.filter(u => u.includes('humazur'));
  if (humazurUrls.length && !bnfManifests.length) {
    console.log(`  HumaZur source: ${humazurUrls[0]}`);
  }

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would update maps:', JSON.stringify(update, null, 2));
    if (bnfIiifImage) console.log(`  [DRY RUN] Would add BnF IIIF source: ${bnfIiifImage}`);
    return;
  }

  // ---- write to DB ----
  await sbPatch(`/maps?id=eq.${id}`, update);
  console.log('  ✓ maps updated');

  // Add BnF IIIF as secondary source if it's different from current primary
  if (bnfIiifImage && finalSourceType === 'bnf') {
    // Check existing sources
    const existing = await sbGet(`/map_iiif_sources?map_id=eq.${id}`);
    const alreadyHas = existing.some(s => s.iiif_image === bnfIiifImage);
    if (!alreadyHas) {
      // If current primary is IA, add BnF as non-primary secondary
      const hasPrimary = existing.some(s => s.is_primary);
      await sbPost('/map_iiif_sources', {
        map_id:        id,
        label:         'BnF Gallica',
        source_type:   'bnf',
        iiif_manifest: manifestToFetch,
        iiif_image:    bnfIiifImage,
        is_primary:    !hasPrimary, // only primary if no primary exists yet
        sort_order:    hasPrimary ? 1 : 0,
      });
      console.log(`  ✓ Added BnF IIIF source (${hasPrimary ? 'secondary' : 'primary'})`);
    } else {
      console.log('  BnF IIIF source already exists');
    }
  }
}

// ---- main ----

async function main() {
  const entries = JSON.parse(readFileSync('scripts/map_sources_ia.json', 'utf8'));
  console.log(`Processing ${entries.length} entries${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  let ok = 0, fail = 0;
  for (const entry of entries) {
    try {
      await processEntry(entry);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${err.message}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 400));
  }
  console.log(`\nDone: ${ok} ok, ${fail} failed`);
}

main().catch(e => { console.error(e); process.exit(1); });
