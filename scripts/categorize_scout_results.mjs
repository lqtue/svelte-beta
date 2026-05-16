#!/usr/bin/env node
// Categorize and score scout results so a human can quickly approve/reject in bulk.
// Output: scripts/scout_review.csv (sorted by score desc) + summary table.
//
// Scoring:
//   +20  Vietnamese place name in title       +15  map-type keywords (plan, carte top.)
//   +20  year 1850-1955 (core colonial)       +10  year 1700-1850 (pre-colonial)
//   +10  type field is map/carte              +5   has IIIF manifest
//   -30  railway / ligne / réseau             -50  world map / hémisphères
//   -10  no year                              -5   esquisse / croquis
//
// Categories: cadastral · urban_plan · topographic · route_railway · route_road ·
//             regional · world · atlas_plate · unknown
//
// Usage:
//   node scripts/categorize_scout_results.mjs [--report <path>]

import { readFileSync, readdirSync, writeFileSync } from 'fs';

const ridx = process.argv.indexOf('--report');
const reportPath = ridx > -1
  ? process.argv[ridx + 1]
  : 'scripts/' + readdirSync('scripts').filter(f => f.startsWith('scout_results_')).sort().pop();

const data = JSON.parse(readFileSync(reportPath, 'utf8'));
const candidates = data.newCandidates || [];
console.log(`Categorizing ${candidates.length} new candidates from ${reportPath}\n`);

const VN_PLACES = [
  'saigon', 'saïgon', 'sài gòn', 'sai gon',
  'hanoi', 'hanoï', 'hà nội',
  'hue', 'hué', 'huế',
  'da nang', 'đà nẵng', 'tourane',
  'haiphong', 'hải phòng',
  'cholon', 'chợ lớn', 'cho lon',
  'gia dinh', 'gia định',
  'cochinchine', 'tonkin', 'annam', 'indochine', 'indo-chine',
  'mekong', 'mékong', 'song-koi', 'sông',
  'vietnam', 'viêt-nam', 'viêtnam', 'viet-nam',
  'cambodge', 'cambodia', 'laos',
  'cap saint-jacques', 'vũng tàu', 'vung tau',
  'bac bo', 'bắc bộ', 'trung bo', 'trung bộ', 'nam bo', 'nam bộ',
  'thanh hoa', 'thanh hóa', 'vinh', 'phu yen', 'phú yên',
  'dalat', 'đà lạt', 'nha trang', 'phan thiet',
];

const MAP_TYPE_HINTS = [
  /plan\s+(de|du|topograph|cadastr|directeur)/i,
  /carte\s+(topograph|routi|d['e]?\s|général|administr|hydrograph|géolog)/i,
  /atlas/i, /levé/i, /croquis topographique/i,
];

function asArr(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }
function firstStr(v) { return asArr(v)[0] || ''; }
function scoreRecord(r) {
  const titleStr = firstStr(r.title);
  const title = titleStr.toLowerCase();
  const subj = asArr(r.subject ?? r.raw?.subject);
  const cov = asArr(r.coverage ?? r.raw?.coverage ?? r.raw?.region ?? r.raw?.country ?? r.raw?.city);
  const allText = [titleStr, ...subj, ...cov].join(' | ').toLowerCase();
  let score = 0;
  let category = 'unknown';
  const reasons = [];

  // Year extraction
  const dateStr = asArr(r.date).join(' ');
  const yearMatch = (dateStr.match(/\b(1[5-9]\d\d|20\d\d)\b/) || [])[1];
  const year = yearMatch ? parseInt(yearMatch) : null;

  // Vietnam place
  const matchedPlaces = VN_PLACES.filter(p => allText.includes(p));
  if (matchedPlaces.length) { score += 20; reasons.push(`+place:${matchedPlaces[0]}`); }
  else { score -= 10; reasons.push('-no_vn_place'); }

  // Year scoring
  if (year && year >= 1850 && year <= 1955) { score += 20; reasons.push(`+colonial:${year}`); }
  else if (year && year >= 1700 && year < 1850) { score += 10; reasons.push(`+precolonial:${year}`); }
  else if (year && year > 1955) { score += 5; reasons.push(`+modern:${year}`); }
  else if (!year) { score -= 10; reasons.push('-no_year'); }

  // Map type keywords
  if (MAP_TYPE_HINTS.some(re => re.test(title))) { score += 15; reasons.push('+map_type'); }
  const typeArr = asArr(r.type ?? r.raw?.type);
  if (typeArr.some(t => /carte|map|plan/i.test(String(t)))) { score += 10; reasons.push('+type_field'); }

  // Has IIIF manifest
  if (r.ark || r.manifestUrl || r.source === 'rumsey' || r.source === 'loc') { score += 5; reasons.push('+iiif'); }

  // Negative signals — categorize
  if (/monde|hémisphère|hemisphere|projection mondiale|carte universelle/.test(title)) {
    score -= 50; category = 'world'; reasons.push('-world');
  }
  else if (/chemin de fer|voie[s]? ferrée|réseau ferroviaire|ligne ferroviaire|tramway/.test(title)) {
    score -= 30; category = 'route_railway'; reasons.push('-railway');
  }
  else if (/carte routière|routier|itinéraire|réseau routier/.test(title)) {
    category = 'route_road';
  }
  else if (/cadastr/.test(title)) {
    category = 'cadastral'; score += 5;
  }
  else if (/plan de la ville|plan de saigon|plan de hanoi|plan de hué|plan de la cité/.test(title)) {
    category = 'urban_plan'; score += 10;
  }
  else if (/topograph/.test(title)) {
    category = 'topographic'; score += 5;
  }
  else if (/atlas/.test(title)) {
    category = 'atlas_plate'; score -= 5;
  }
  else if (/carte/.test(title)) {
    category = 'regional';
  }
  else if (/plan/.test(title)) {
    category = 'urban_plan';
  }
  if (/esquisse|croquis|schéma|schema/.test(title)) { score -= 5; reasons.push('-sketch'); }
  if (/extrait|extracted from|tiré|tirée/.test(title)) { score -= 10; reasons.push('-extract'); }

  // Photo / non-cartographic detection (Humazur set 519 dumps lots of photos)
  const HAS_MAP_KEYWORD = /\b(plan|carte|atlas|map|levé|levée|croquis|topograph|cadastr|chart|tableau d|projection|itinéraire|carte routi)/i.test(title);
  const PHOTO_HINTS = /\b(vue|intérieur|extérieur|façade|rue|avenue|boulevard|pagode|temple|village|hameau|maison|pont|gare|chemin de fer|monument|famille|femme|homme|enfant|boutique|marché|marche|fête|f[êe]te|portrait|jardin|tombeau|cimet|chapelle|église|cathédrale|h[oô]tel|caserne|école|usine|port|navire|bateau|pirogue|jonque|costume|annamite|tonkinois|cochinchinois|moïs|cham|laotien|cambodgien|paysage|panorama photographique|cérémonie|cortège|défilé)\b/i;
  if (!HAS_MAP_KEYWORD && PHOTO_HINTS.test(title)) {
    score -= 60; category = 'photo'; reasons.push('-photo_subject');
  } else if (!HAS_MAP_KEYWORD && r.source === 'humazur' && (r.raw?.collection || '') === 'Indochine française') {
    score -= 30; category = category === 'unknown' ? 'non_cartographic' : category; reasons.push('-no_map_kw');
  }

  return { score, category, year, reasons };
}

const rows = [];
for (const r of candidates) {
  const s = scoreRecord(r);
  rows.push({
    score: s.score,
    category: s.category,
    year: s.year || '',
    source: r.source || 'gallica',
    holding_institution: r.holding_institution || r.provenance || '',
    title: firstStr(r.title).replace(/\s+/g, ' ').slice(0, 220),
    creator: firstStr(r.creator).replace(/\s+/g, ' ').slice(0, 120),
    externalId: r.externalId || r.ark || '',
    foundVia: (r.foundVia || []).join(';'),
    reasons: s.reasons.join(' '),
    manifestUrl: r.manifestUrl || (r.ark ? `https://gallica.bnf.fr/iiif/${r.ark}/manifest.json` : ''),
    sourceUrl: r.sourceUrl || '',
  });
}

rows.sort((a, b) => b.score - a.score);

// --- write CSV ---
function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
const headers = ['action', 'score', 'category', 'year', 'source', 'holding_institution', 'title', 'creator', 'externalId', 'foundVia', 'reasons', 'manifestUrl', 'sourceUrl'];
const csvLines = [headers.join(',')];
for (const r of rows) {
  csvLines.push([
    '', // action — empty for user to fill (e.g. "y" to ingest)
    r.score, r.category, r.year, r.source, r.holding_institution, r.title, r.creator, r.externalId, r.foundVia, r.reasons, r.manifestUrl, r.sourceUrl,
  ].map(csvCell).join(','));
}
const csvPath = 'scripts/scout_review.csv';
writeFileSync(csvPath, csvLines.join('\n'));

// --- summary ---
const byCategory = {};
const byScoreBucket = { 'high (≥40)': 0, 'medium (20–39)': 0, 'low (0–19)': 0, 'negative (<0)': 0 };
for (const r of rows) {
  byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  if (r.score >= 40) byScoreBucket['high (≥40)']++;
  else if (r.score >= 20) byScoreBucket['medium (20–39)']++;
  else if (r.score >= 0) byScoreBucket['low (0–19)']++;
  else byScoreBucket['negative (<0)']++;
}

console.log(`--- By score bucket ---`);
for (const [b, c] of Object.entries(byScoreBucket)) console.log(`  ${b.padEnd(20)} ${c}`);
console.log(`\n--- By category ---`);
for (const [c, n] of Object.entries(byCategory).sort((a,b)=>b[1]-a[1])) console.log(`  ${c.padEnd(20)} ${n}`);

console.log(`\n--- Top 15 ---`);
for (const r of rows.slice(0, 15)) {
  console.log(`  [${r.score}] [${r.year}] ${r.category.padEnd(14)} ${r.title.slice(0, 80)}`);
}
console.log(`\n--- Bottom 5 (likely noise) ---`);
for (const r of rows.slice(-5)) {
  console.log(`  [${r.score}] [${r.year}] ${r.category.padEnd(14)} ${r.title.slice(0, 80)}`);
}

console.log(`\nCSV written: ${csvPath}`);
console.log(`Mark column "action" with "y" to ingest, leave blank to skip, then run:`);
console.log(`  node scripts/ingest_scout_approved.mjs        (dry-run)`);
console.log(`  node scripts/ingest_scout_approved.mjs --apply`);
