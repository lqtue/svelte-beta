#!/usr/bin/env node
// Fetch authoritative metadata from origin sources for each hosted map,
// then diff against current Supabase values. READ-ONLY — no writes.
//
// Output: scripts/metadata_audit_<timestamp>.json + console diff summary
//
// Usage: node scripts/fetch_hosted_metadata.mjs [--source bnf|ia|all]

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim())).filter(([k]) => k)
);
const SUPABASE_URL = env.PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY;
const sIdx = process.argv.indexOf('--source');
const SOURCE_FILTER = sIdx > -1 ? process.argv[sIdx + 1] : 'all';
const UA = 'Mozilla/5.0 VMA-MetadataAudit/1.0';

async function sb(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

async function fetchJson(url, { retries = 4, baseDelay = 2000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.status === 429 || r.status === 503) {
        if (attempt === retries) return { error: `${r.status}` };
        const wait = baseDelay * Math.pow(2, attempt);
        await new Promise(res => setTimeout(res, wait));
        continue;
      }
      if (!r.ok) return { error: `${r.status}` };
      return await r.json();
    } catch (e) {
      if (attempt === retries) return { error: e.message };
      await new Promise(res => setTimeout(res, baseDelay * Math.pow(2, attempt)));
    }
  }
}

// ---- normalize a IIIF v2 metadata array into a flat object ----
function flattenIIIFv2(manifest) {
  const out = { _label: typeof manifest.label === 'string' ? manifest.label : null,
                _attribution: manifest.attribution || null,
                _license: manifest.license || null };
  for (const item of (manifest.metadata || [])) {
    const lbl = item.label;
    let val = item.value;
    if (Array.isArray(val)) val = val.map(v => v?.['@value'] || v).join(' | ');
    else if (typeof val === 'object' && val?.['@value']) val = val['@value'];
    if (!out[lbl]) out[lbl] = val;
    else out[lbl] = `${out[lbl]} | ${val}`;
  }
  return out;
}

// ---- BnF/Gallica manifest → normalized fields ----
function parseBnF(manifest) {
  const m = flattenIIIFv2(manifest);
  // shelfmark: strip "Bibliothèque nationale de France, " prefix
  let shelfmark = m['Shelfmark'] || null;
  if (shelfmark) shelfmark = shelfmark.replace(/^Bibliothèque nationale de France,?\s*/, '').replace(/^département\s+/, '');
  // strip "Auteur du texte" / role suffixes from creator
  let creator = m['Creator'] || null;
  if (creator) creator = creator.split(' | ')[0].replace(/\.\s*(Auteur du texte|Collaborateur|Dessinateur|Graveur|Cartographe|Éditeur|éditeur)\s*$/i, '').trim();
  let format = m['Format'] || null;
  if (format) format = format.split(' | ').filter(x => !x.match(/^image\/|Nombre total/)).join(' ; ');
  return {
    holding_institution: 'Bibliothèque nationale de France',
    collection: m['Repository'] === 'Bibliothèque nationale de France' && m['Shelfmark']?.includes('Cartes et plans') ? 'Département Cartes et plans' : null,
    shelfmark,
    original_title: m['Title'] || null,
    creator,
    year_label: m['Date'] || null,
    language: m['Language'] || null,
    rights: m['_license'] || null,
    physical_description: format,
    dc_publisher: null, // BnF rarely populates this distinctly; creator usually carries it
  };
}

// ---- Humazur (Omeka) page → IIIF manifest → normalized fields ----
function stripHtml(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x([0-9a-f]+);/gi, (_,h) => String.fromCharCode(parseInt(h, 16))).replace(/&#039;/g, "'").replace(/&quot;/g, '"').trim();
}
async function fetchHumazur(arkUrl) {
  // Page contains: iiif/<id>/manifest
  let pageR;
  try {
    pageR = await fetch(arkUrl, { headers: { 'User-Agent': UA } });
    if (!pageR.ok) return { error: `humazur page: ${pageR.status}` };
  } catch (e) { return { error: e.message }; }
  const html = await pageR.text();
  const m = html.match(/iiif\/(\d+)\/manifest/);
  if (!m) return { error: 'no manifest link in humazur page' };
  const manifestUrl = `https://humazur.univ-cotedazur.fr/iiif/${m[1]}/manifest`;
  const manifest = await fetchJson(manifestUrl);
  if (manifest.error) return { error: `humazur manifest: ${manifest.error}` };
  const flat = flattenIIIFv2(manifest);
  return {
    holding_institution: 'Humazur, Université Côte d\'Azur',
    collection: stripHtml(flat['Source']) || 'BU Lettres Arts Sciences Humaines, Fonds ASEMI',
    shelfmark: stripHtml(flat['Cote']) || null,
    original_title: stripHtml(flat['Title']) || stripHtml(flat['Alternative Title']) || null,
    creator: stripHtml(flat['Auteur'])?.split(' | ')[0] || null,
    dc_publisher: stripHtml(flat['Éditeur']) || null,
    year_label: stripHtml(flat['Date']) || null,
    language: 'français',
    rights: stripHtml(flat['Rights']) || null,
    physical_description: stripHtml(flat['Technique et dimensions']) || null,
  };
}

// ---- Internet Archive item metadata → normalized fields ----
async function fetchIAitem(iiifManifestUrl) {
  // https://iiif.archive.org/iiif/<identifier>/manifest.json
  const m = iiifManifestUrl.match(/iiif\.archive\.org\/iiif\/([^/]+)\/manifest/);
  if (!m) return { error: 'cannot parse IA identifier' };
  const id = m[1];
  return await fetchJson(`https://archive.org/metadata/${id}`);
}

function parseIAOriginUrl(srcUrl) {
  if (!srcUrl) return null;
  if (srcUrl.includes('gallica.bnf.fr')) return { holder: 'Bibliothèque nationale de France', slug: 'bnf' };
  if (srcUrl.includes('maps.lib.utexas.edu')) return { holder: 'University of Texas at Austin, Perry-Castañeda Library Map Collection', slug: 'utaustin-pcl' };
  if (srcUrl.includes('humazur.univ-cotedazur.fr')) return { holder: 'Humazur, Université Côte d\'Azur', slug: 'humazur' };
  if (srcUrl.includes('blogs.loc.gov') || srcUrl.includes('loc.gov')) return { holder: 'Library of Congress', slug: 'loc' };
  if (srcUrl.includes('virtual-saigon.net') || srcUrl.includes('virtualsaigon')) return { holder: 'Virtual Saigon (IRD)', slug: 'virtual-saigon' };
  if (srcUrl.includes('wikipedia.org') || srcUrl.includes('wikimedia.org')) return { holder: 'Wikimedia Commons', slug: 'wikimedia' };
  if (srcUrl.includes('davidrumsey.com')) return { holder: 'David Rumsey Map Collection', slug: 'rumsey' };
  return { holder: null, slug: 'unknown', source_url_host: new URL(srcUrl).hostname };
}

// ---- Fetch all maps ----
const cols = 'id,name,source_type,iiif_manifest,iiif_image,source_url,original_title,creator,dc_publisher,year_label,year,shelfmark,rights,language,physical_description,collection';
const filter = SOURCE_FILTER === 'all' ? 'source_type=in.(bnf,ia)' : `source_type=eq.${SOURCE_FILTER}`;
const maps = await sb(`/maps?select=${cols}&${filter}&order=source_type.asc`);

console.log(`Fetching origin metadata for ${maps.length} maps...\n`);

const report = [];
for (let i = 0; i < maps.length; i++) {
  const m = maps[i];
  process.stdout.write(`  [${i+1}/${maps.length}] ${m.source_type} ${m.name.slice(0,55).padEnd(55)} ... `);
  const entry = { id: m.id, name: m.name, source_type: m.source_type, current: m, fetched: null, diff: {}, errors: [] };

  if (m.source_type === 'bnf' && m.iiif_manifest) {
    const manifest = await fetchJson(m.iiif_manifest);
    if (manifest.error) entry.errors.push(`manifest: ${manifest.error}`);
    else entry.fetched = parseBnF(manifest);
  } else if (m.source_type === 'ia' && m.iiif_manifest) {
    const iaMeta = await fetchIAitem(m.iiif_manifest);
    const origin = parseIAOriginUrl(m.source_url);
    if (iaMeta.error) entry.errors.push(`IA: ${iaMeta.error}`);
    entry.fetched = {
      ia_uploaded_metadata: iaMeta.metadata ? {
        title: iaMeta.metadata.title,
        creator: iaMeta.metadata.creator,
        date: iaMeta.metadata.date,
        description: typeof iaMeta.metadata.description === 'string' ? iaMeta.metadata.description.slice(0, 200) : null,
        licenseurl: iaMeta.metadata.licenseurl,
        subject: iaMeta.metadata.subject,
      } : null,
      origin_from_source_url: origin,
      holding_institution: origin?.holder || null,
    };
    // If IA origin is BnF, try fetching the BnF manifest for richer data
    if (origin?.slug === 'bnf') {
      const arkMatch = m.source_url.match(/ark:\/[0-9]+\/[a-z0-9]+/i);
      if (arkMatch) {
        const bnfManifest = await fetchJson(`https://gallica.bnf.fr/iiif/${arkMatch[0]}/manifest.json`);
        if (!bnfManifest.error) {
          entry.fetched.bnf_origin_data = parseBnF(bnfManifest);
        }
      }
    } else if (origin?.slug === 'humazur') {
      const humazurData = await fetchHumazur(m.source_url.split('#')[0]);
      if (!humazurData.error) entry.fetched.humazur_origin_data = humazurData;
      else entry.errors.push(`humazur: ${humazurData.error}`);
    } else if (origin?.slug === 'utaustin-pcl') {
      // URL pattern: txu-pclmaps-oclc-<oclc>-<sheet>.jpg → can extract identifiers
      const idMatch = m.source_url.match(/txu-pclmaps-oclc-(\d+)-?(.*?)\.jpg/);
      entry.fetched.utaustin_origin_data = {
        holding_institution: 'University of Texas at Austin, Perry-Castañeda Library Map Collection',
        collection: 'AMS Series L7014 (Vietnam 1:50,000)',
        shelfmark: idMatch ? `OCLC ${idMatch[1]} / Sheet ${idMatch[2]}` : null,
        creator: 'U.S. Army Map Service',
        rights: 'Public domain (U.S. Government work)',
        language: 'English',
      };
    }
  }

  // diff fields
  if (entry.fetched) {
    const f = entry.fetched.bnf_origin_data || entry.fetched.humazur_origin_data || entry.fetched.utaustin_origin_data || entry.fetched;
    for (const k of ['original_title', 'creator', 'year_label', 'shelfmark', 'rights', 'language', 'physical_description', 'holding_institution']) {
      const curr = m[k];
      const next = f[k];
      if (next && (!curr || curr !== next)) {
        entry.diff[k] = { current: curr || null, proposed: next };
      }
    }
  }
  report.push(entry);
  console.log(entry.errors.length ? `ERR: ${entry.errors.join(';')}` : `${Object.keys(entry.diff).length} diffs`);
  await new Promise(r => setTimeout(r, m.source_type === 'bnf' ? 2500 : 500)); // BnF rate-limits hard
}

const out = `scripts/metadata_audit_${Date.now()}.json`;
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\nReport saved: ${out}`);

// ---- summary ----
console.log(`\n=== DIFF SUMMARY ===`);
const fieldCounts = {};
for (const e of report) for (const k of Object.keys(e.diff)) fieldCounts[k] = (fieldCounts[k] || 0) + 1;
console.log(`Fields that would change (across ${report.length} maps):`);
for (const [k, c] of Object.entries(fieldCounts).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${k.padEnd(24)} ${c} maps`);
}
const errors = report.filter(e => e.errors.length);
if (errors.length) {
  console.log(`\nErrors on ${errors.length} maps:`);
  for (const e of errors) console.log(`  ${e.id.slice(0,8)} ${e.name.slice(0,40)} :: ${e.errors.join('; ')}`);
}

// IA holding institution distribution
console.log(`\nIA-mirrored maps — true origin distribution:`);
const holderCounts = {};
for (const e of report) {
  if (e.source_type === 'ia') {
    const h = e.fetched?.holding_institution || '(unknown)';
    holderCounts[h] = (holderCounts[h] || 0) + 1;
  }
}
for (const [h, c] of Object.entries(holderCounts).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${String(c).padStart(2)}  ${h}`);
}
