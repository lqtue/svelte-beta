// Move map eca788e5 onto the 2x scan: rewrite the annotation, rescale every
// pixel-space value, repoint the IIIF base. new = S*old + T (fitted, ±7 new px).
//
// RAN ONCE, 2026-09-11, against production. This is a record, not a tool: it
// multiplies every pixel-space value in place, so a second run double-scales
// the annotation, the triage and all 1391 extractions, and nothing downstream
// would report an error — the map would simply stop lining up with itself.
// A different sheet needs its own transform fitted and its own copy of this.
import { createClient } from '@supabase/supabase-js';
import { generateId } from '@allmaps/id';

const ID = 'eca788e5-6780-4dca-bf23-7651a1c48aba';
const NEW_BASE = `https://iiif.maparchive.vn/iiif/${ID}-20260911`;
const S = 1.99425,
  TX = -103.9,
  TY = -139.0;
const NEW_W = 14915,
  NEW_H = 12602;
const apply = process.argv.includes('--apply');

const sx = (v) => Math.round(v * S + TX);
const sy = (v) => Math.round(v * S + TY);
const sw = (v) => Math.round(v * S); // widths/heights carry no offset

const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ── 1. annotation ──────────────────────────────────────────────────────────
const map = (
  await db.from('maps').select('annotation_url, triage, thumbnail').eq('id', ID).single()
).data;
const ann = await (await fetch(map.annotation_url)).json();
const item = ann.items[0];
const newAllmapsId = await generateId(NEW_BASE);

item.target.source.id = NEW_BASE;
item.target.source.width = NEW_W;
item.target.source.height = NEW_H;
const svg = item.target.selector.value;
item.target.selector.value = svg
  .replace(/width="\d+"/, `width="${NEW_W}"`)
  .replace(/height="\d+"/, `height="${NEW_H}"`)
  .replace(
    /points="([^"]+)"/,
    (_, pts) =>
      'points="' +
      pts
        .trim()
        .split(/\s+/)
        .map((p) => {
          const [a, b] = p.split(',').map(Number);
          return `${sx(a)},${sy(b)}`;
        })
        .join(' ') +
      '"'
  );
for (const f of item.body.features) {
  const [x, y] = f.properties.resourceCoords;
  f.properties.resourceCoords = [sx(x), sy(y)];
}
ann.id = `https://annotations.allmaps.org/images/${newAllmapsId}`;
console.log(
  'allmaps id',
  newAllmapsId,
  '| gcps',
  item.body.features.length,
  '| first gcp',
  item.body.features[0].properties.resourceCoords
);

// ── 2. triage ──────────────────────────────────────────────────────────────
const t = structuredClone(map.triage);
if (t.neatline)
  t.neatline = [sx(t.neatline[0]), sy(t.neatline[1]), sw(t.neatline[2]), sw(t.neatline[3])];
for (const r of t.regions ?? [])
  r.bbox = [sx(r.bbox[0]), sy(r.bbox[1]), sw(r.bbox[2]), sw(r.bbox[3])];
if (t.tile_size) t.tile_size = sw(t.tile_size);
if (t.overlap) t.overlap = sw(t.overlap);
if (t.tile_overrides) {
  t.tile_overrides = Object.fromEntries(
    Object.entries(t.tile_overrides).map(([k, v]) => {
      const [x, y, w, h] = k.split('_').map(Number);
      return [`${sx(x)}_${sy(y)}_${sw(w)}_${sw(h)}`, v];
    })
  );
}
console.log(
  'triage: neatline',
  t.neatline,
  '| regions',
  (t.regions ?? []).length,
  '| tile_size',
  t.tile_size,
  '| overrides',
  Object.keys(t.tile_overrides ?? {}).length
);

// ── 3. extractions ─────────────────────────────────────────────────────────
let rows = [],
  from = 0;
for (;;) {
  const { data, error } = await db
    .from('ocr_extractions')
    .select('*')
    .eq('map_id', ID)
    .order('id')
    .range(from, from + 999);
  if (error) throw error;
  rows = rows.concat(data);
  if (data.length < 1000) break;
  from += 1000;
}
console.log('extractions', rows.length);

const NUMERAL = /^\(?\d{1,3}\)?$/;
let recat = 0;
const scaled = rows.map((r) => {
  const out = { ...r };
  delete out.global_xi;
  delete out.global_yi; // generated columns
  for (const [k, f] of [
    ['tile_x', sx],
    ['tile_y', sy],
    ['global_x', sx],
    ['global_y', sy],
  ])
    if (out[k] != null) out[k] = f(out[k]);
  for (const k of ['tile_w', 'tile_h', 'global_w', 'global_h', 'label_w', 'label_h'])
    if (out[k] != null) out[k] = sw(out[k]);
  // The numerals the index pass read came back as `other` — the prompt's own
  // `index_key` never made it into a response. legend_ref is what the review UI
  // draws and what the 1959 sheet used, and it is what joins to legend_entry.
  if (out.category === 'other' && NUMERAL.test((out.text ?? '').trim())) {
    out.category = 'legend_ref';
    recat++;
  }
  return out;
});
console.log('numerals reclassified to legend_ref:', recat);

if (!apply) {
  console.log('\n(dry run — pass --apply)');
  process.exit(0);
}

// ── write ──────────────────────────────────────────────────────────────────
const path = map.annotation_url.split('/annotations/')[1];
const up = await db.storage
  .from('annotations')
  .upload(path, new Blob([JSON.stringify(ann)], { type: 'application/json' }), { upsert: true });
if (up.error) throw up.error;
console.log('annotation uploaded', path);

for (let i = 0; i < scaled.length; i += 500) {
  const { error } = await db
    .from('ocr_extractions')
    .upsert(scaled.slice(i, i + 500), { onConflict: 'id' });
  if (error) throw error;
  console.log('  rows', i + Math.min(500, scaled.length - i), '/', scaled.length);
}

const upd = await db
  .from('maps')
  .update({
    iiif_image: NEW_BASE,
    allmaps_id: newAllmapsId,
    thumbnail: `${NEW_BASE}/full/800,/0/default.jpg`,
    triage: t,
  })
  .eq('id', ID);
if (upd.error) throw upd.error;
console.log('maps row updated →', NEW_BASE);

const src = await db.from('map_iiif_sources').select('id, iiif_image').eq('map_id', ID);
for (const s of src.data ?? []) {
  if (s.iiif_image?.includes('maparchive.vn')) {
    await db.from('map_iiif_sources').update({ iiif_image: NEW_BASE }).eq('id', s.id);
    console.log('map_iiif_sources row repointed', s.id);
  }
}
