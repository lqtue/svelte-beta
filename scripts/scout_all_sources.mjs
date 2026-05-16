#!/usr/bin/env node
// Unified scout: discover Vietnam/Indochina maps across multiple sources,
// normalize into a single schema, dedup, and emit unified scout JSON.
//
// Sources:
//   1. Gallica SRU         (BnF + federated: Humazur, Bordeaux 3, Paris, Sorbonne)
//   2. David Rumsey Luna   (Stanford collection, ~994 Vietnam hits)
//   3. Library of Congress (loc.gov JSON API)
//
// Skipped (low signal / no API):
//   - Internet Archive (3500+ noisy hits, no clean filter)
//   - Cartomundi (JS app, no API)
//   - UT Austin PCL (HTML index)
//
// READ-ONLY. Output: scripts/scout_all_<ts>.json
//
// Usage:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/scout_all_sources.mjs
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/scout_all_sources.mjs --sources gallica,rumsey

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim())).filter(([k]) => k)
);
const SUPABASE_URL = env.PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY;
const UA = 'Mozilla/5.0 VMA-Scout/1.0';

const sIdx = process.argv.indexOf('--sources');
const SOURCES = sIdx > -1
  ? process.argv[sIdx + 1].split(',')
  : ['gallica', 'rumsey', 'loc'];

const KEYWORDS = ['Saigon', 'Cochinchine', 'Indochine', 'Tonkin', 'Annam', 'Hanoi',
                  'Hué', 'Hue', 'Gia Định', 'Cholon', 'Vietnam', 'Viêt-nam',
                  'Đà Nẵng', 'Tourane', 'Haiphong'];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- Existing VMA arks for dedup ----
async function fetchExistingKeys() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/maps?select=iiif_manifest,iiif_image,source_url`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  const rows = await r.json();
  const keys = new Set();
  for (const m of rows) {
    for (const v of [m.iiif_manifest, m.iiif_image, m.source_url]) {
      if (!v) continue;
      const a = v.match(/ark:\/[0-9]+\/[a-z0-9]+/i);
      if (a) keys.add(`ark:${a[0]}`);
      const r = v.match(/RUMSEY~8~1~[0-9~]+/);
      if (r) keys.add(`rumsey:${r[0]}`);
      const l = v.match(/loc\.gov\/(?:resource|item)\/([^/]+)/);
      if (l) keys.add(`loc:${l[1]}`);
    }
  }
  return keys;
}

// ---- Polite fetcher with retry ----
async function fetchJson(url, { retries = 3, baseDelay = 1500, headers = {} } = {}) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } });
      if (r.status === 429 || r.status === 503) {
        if (i === retries) return { __error: r.status };
        await sleep(baseDelay * Math.pow(2, i));
        continue;
      }
      if (!r.ok) return { __error: r.status };
      return await r.json();
    } catch (e) {
      if (i === retries) return { __error: e.message };
      await sleep(baseDelay * Math.pow(2, i));
    }
  }
}

// ===== SOURCE 1: Gallica SRU (federated) =====
function parseSRU(xml) {
  const out = [];
  const blocks = xml.split('<srw:record>').slice(1);
  for (const b of blocks) {
    const end = b.indexOf('</srw:record>');
    if (end === -1) continue;
    const chunk = b.slice(0, end);
    const rec = {};
    for (const f of ['dc:title', 'dc:creator', 'dc:date', 'dc:type', 'dc:format',
                     'dc:language', 'dc:publisher', 'dc:rights', 'dc:source',
                     'dc:identifier', 'dc:coverage', 'dc:subject']) {
      rec[f.replace('dc:', '')] = [];
      const re = new RegExp(`<${f}>([^<]+)</${f}>`, 'g');
      let m; while ((m = re.exec(chunk))) rec[f.replace('dc:', '')].push(m[1]);
    }
    const prov = chunk.match(/<provenance>([^<]+)<\/provenance>/);
    rec.provenance = prov ? prov[1] : null;
    let ark = null;
    for (const id of rec.identifier) {
      const m = id.match(/ark:\/[0-9]+\/[a-z0-9]+/i);
      if (m) { ark = m[0]; break; }
    }
    rec.ark = ark;
    rec.url = rec.identifier.find(i => i.startsWith('http')) || null;
    out.push(rec);
  }
  return out;
}
async function scoutGallica(keywords) {
  const all = new Map();
  for (const kw of keywords) {
    process.stdout.write(`  gallica/${kw.padEnd(13)} `);
    let start = 1; const page = 50;
    while (start <= 250) {
      const q = encodeURIComponent(`(dc.type adj "carte") and (dc.title all "${kw}")`);
      const url = `https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2&query=${q}&maximumRecords=${page}&startRecord=${start}`;
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) { if (r.status === 429) { await sleep(3000); continue; } break; }
      const xml = await r.text();
      const total = parseInt((xml.match(/<srw:numberOfRecords>(\d+)/) || [])[1] || '0');
      const recs = parseSRU(xml);
      for (const rec of recs) {
        const key = rec.ark ? `ark:${rec.ark}` : rec.url || rec.title[0];
        if (!all.has(key)) all.set(key, normalizeGallicaRecord(rec, kw));
        else all.get(key).foundVia.push(kw);
      }
      if (recs.length === 0 || start + page > total) break;
      start += page;
      await sleep(300);
    }
    console.log(`${all.size} unique so far`);
    await sleep(200);
  }
  return [...all.values()];
}
function normalizeGallicaRecord(r, kw) {
  return {
    source: 'gallica',
    externalId: r.ark || r.url || '',
    title: r.title[0] || '',
    creator: r.creator[0] || '',
    publisher: r.publisher[0] || '',
    date: r.date[0] || '',
    rights: r.rights[0] || '',
    language: r.language[0] || '',
    holding_institution: r.provenance && !r.provenance.toLowerCase().includes('gallica')
      ? r.provenance
      : 'Bibliothèque nationale de France',
    manifestUrl: r.ark ? `https://gallica.bnf.fr/iiif/${r.ark}/manifest.json` : '',
    sourceUrl: r.url || (r.ark ? `https://gallica.bnf.fr/${r.ark}` : ''),
    thumbnail: '',
    foundVia: [kw],
    dedupKey: r.ark ? `ark:${r.ark}` : `gallica:${r.title[0]}`,
    raw: { provenance: r.provenance, subject: r.subject, coverage: r.coverage },
  };
}

// ===== SOURCE 2: David Rumsey (Luna) =====
async function scoutRumsey(keywords) {
  const all = new Map();
  for (const kw of keywords) {
    process.stdout.write(`  rumsey/${kw.padEnd(13)} `);
    let start = 0; const page = 50;
    let total = 0;
    while (start < 1000) {
      const url = `https://www.davidrumsey.com/luna/servlet/as/search?q=${encodeURIComponent(kw)}&dh=${page}&os=json&so=${start}`;
      const data = await fetchJson(url);
      if (data.__error) { console.log(`ERR ${data.__error}`); break; }
      total = parseInt(data.totalResults || '0');
      const results = data.results || [];
      for (const r of results) {
        // Filter: must include Vietnam-related country or city
        const fields = Object.fromEntries((r.fieldValues || []).map(fv => {
          const k = Object.keys(fv)[0]; return [k, Array.isArray(fv[k]) ? fv[k][0] : fv[k]];
        }));
        const country = String(fields['Country'] || '');
        const city = String(fields['City'] || '');
        const note = String(fields['Note'] || '');
        const region = String(fields['Region'] || '');
        const combined = (country + ' ' + city + ' ' + region + ' ' + r.displayName).toLowerCase();
        if (!/vietnam|saigon|hanoi|hue|tonkin|annam|cochinchin|indochin|cambodia|laos|indochine/i.test(combined)) continue;
        const id = r.id;
        const key = `rumsey:${id}`;
        if (!all.has(key)) all.set(key, {
          source: 'rumsey',
          externalId: id,
          title: r.displayName || fields['Short Title'] || '',
          creator: fields['Author'] || fields['Authors'] || '',
          publisher: fields['Publisher'] || '',
          date: fields['Date'] || fields['Pub Date'] || '',
          rights: 'David Rumsey Map Collection',
          language: '',
          holding_institution: 'David Rumsey Map Collection (Stanford)',
          manifestUrl: r.iiifManifest || '',
          sourceUrl: `https://www.davidrumsey.com/luna/servlet/detail/${id}`,
          thumbnail: r.urlSize2 || r.urlSize1 || '',
          foundVia: [kw],
          dedupKey: key,
          raw: { type: fields['Type'], country, city, region, note: note.slice(0, 200) },
        });
        else all.get(key).foundVia.push(kw);
      }
      if (results.length < page) break;
      start += page;
      await sleep(500);
    }
    console.log(`(${total} total raw, ${all.size} unique vn-filtered)`);
    await sleep(300);
  }
  return [...all.values()];
}

// ===== SOURCE 3: Library of Congress =====
async function scoutLoC(keywords) {
  const all = new Map();
  for (const kw of keywords) {
    process.stdout.write(`  loc/${kw.padEnd(16)} `);
    let page = 1; let totalSeen = 0;
    while (page <= 10) {
      const url = `https://www.loc.gov/maps/?q=${encodeURIComponent(kw)}&fo=json&c=50&sp=${page}`;
      const data = await fetchJson(url);
      if (data.__error) { console.log(`ERR ${data.__error}`); break; }
      const results = data.results || [];
      if (!results.length) break;
      const total = parseInt((data.pagination || {}).of || '0');
      for (const r of results) {
        if (r.original_format && !r.original_format.includes('map')) continue;
        const id = r.id || r.url;
        const key = `loc:${id}`;
        if (!all.has(key)) all.set(key, {
          source: 'loc',
          externalId: id,
          title: r.title || '',
          creator: (Array.isArray(r.contributor) ? r.contributor.join(', ') : r.contributor) || '',
          publisher: '',
          date: r.date || '',
          rights: (Array.isArray(r.rights) ? r.rights[0] : r.rights) || 'Library of Congress',
          language: (Array.isArray(r.language) ? r.language[0] : r.language) || '',
          holding_institution: 'Library of Congress',
          manifestUrl: '', // LoC IIIF: r.resources may contain a manifest
          sourceUrl: r.url || `https://www.loc.gov/item/${id}`,
          thumbnail: (Array.isArray(r.image_url) ? r.image_url[0] : r.image_url) || '',
          foundVia: [kw],
          dedupKey: key,
          raw: { subject: r.subject, location: r.location, dates: r.dates },
        });
        else all.get(key).foundVia.push(kw);
      }
      totalSeen = total;
      if (results.length < 50 || page * 50 >= total) break;
      page++;
      await sleep(300);
    }
    console.log(`(${totalSeen} total, ${all.size} unique)`);
  }
  return [...all.values()];
}

// ===== main =====
const existingKeys = await fetchExistingKeys();
console.log(`VMA has ${existingKeys.size} known external keys for dedup\n`);

const merged = new Map();
const counts = {};

if (SOURCES.includes('gallica')) {
  console.log('=== Gallica SRU (BnF + federated) ===');
  const recs = await scoutGallica(KEYWORDS);
  counts.gallica = recs.length;
  for (const r of recs) merged.set(r.dedupKey, r);
}
if (SOURCES.includes('rumsey')) {
  console.log('\n=== David Rumsey ===');
  const recs = await scoutRumsey(KEYWORDS);
  counts.rumsey = recs.length;
  for (const r of recs) merged.set(r.dedupKey, r);
}
if (SOURCES.includes('loc')) {
  console.log('\n=== Library of Congress ===');
  const recs = await scoutLoC(KEYWORDS);
  counts.loc = recs.length;
  for (const r of recs) merged.set(r.dedupKey, r);
}

const all = [...merged.values()];
const alreadyInVma = all.filter(r => existingKeys.has(r.dedupKey));
const newCandidates = all.filter(r => !existingKeys.has(r.dedupKey));

console.log(`\n=== MERGED ===`);
console.log(`Total unique:    ${all.length}`);
console.log(`Already in VMA:  ${alreadyInVma.length}`);
console.log(`New candidates:  ${newCandidates.length}\n`);

console.log(`By source:`);
const bySource = {};
for (const r of all) bySource[r.source] = (bySource[r.source] || 0) + 1;
for (const [s, c] of Object.entries(bySource)) console.log(`  ${s.padEnd(10)} ${c}`);

console.log(`\nBy holding institution (top 10):`);
const byHolder = {};
for (const r of all) byHolder[r.holding_institution] = (byHolder[r.holding_institution] || 0) + 1;
for (const [h, c] of Object.entries(byHolder).sort((a,b)=>b[1]-a[1]).slice(0, 10)) {
  console.log(`  ${String(c).padStart(4)}  ${h}`);
}

// Decade histogram
const decade = {};
for (const r of newCandidates) {
  const ys = (r.date || '').match(/\b(1[5-9]\d\d|20\d\d)\b/);
  const d = ys ? Math.floor(parseInt(ys[1]) / 10) * 10 : null;
  const k = d ? `${d}s` : '(no year)';
  decade[k] = (decade[k] || 0) + 1;
}
console.log(`\nNew candidates by decade:`);
for (const [d, c] of Object.entries(decade).sort()) {
  console.log(`  ${d.padEnd(10)} ${'█'.repeat(Math.min(c, 60))} ${c}`);
}

const out = `scripts/scout_all_${Date.now()}.json`;
writeFileSync(out, JSON.stringify({
  sources: SOURCES,
  keywords: KEYWORDS,
  counts,
  totalUnique: all.length,
  alreadyInVma: alreadyInVma.length,
  newCandidates,
  alreadyInVma_records: alreadyInVma,
}, null, 2));
console.log(`\nSaved: ${out}`);
console.log(`Next: node scripts/categorize_scout_results.mjs --report ${out}`);
