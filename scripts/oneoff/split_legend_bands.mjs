// Give every legend row its own printed line, without paying for a re-read.
//
// `_write_legend_rows` used to stamp each entry of a `--region` with that
// region's crop, so a column of the printed directory came back as N rows all
// carrying one rectangle — 235 rows over six rectangles on the 1942 sheet, one
// of them standing for 52 lines. ocr.py splits the band now; this does the same
// arithmetic over the rows already written, which is the difference between a
// backfill and re-running the legend pass on every sheet.
//
// Same rule as `legend_line_boxes` in work/ocr/scripts/ocr.py: a band is one
// column read in one call, its entries are in printed order, so the lines are
// the band divided by how many there are. It abstains where that would be a
// guess — fewer than three lines, or a pitch no printed line has.
//
// Dry run by default. `--apply` writes. `--map <uuid>` narrows to one sheet.
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');
const mapArg = process.argv.indexOf('--map');
const onlyMap = mapArg === -1 ? null : process.argv[mapArg + 1];

const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const numberOf = (notes) => Number(/\bn=(\d+)/.exec(notes ?? '')?.[1]);

let query = db
  .from('ocr_extractions')
  .select('id, map_id, run_id, notes, global_x, global_y, global_w, global_h')
  .eq('category', 'legend_entry');
if (onlyMap) query = query.eq('map_id', onlyMap);

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await query.range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}

// A band is every row sharing one rectangle inside one run — which is exactly
// the set the old code stamped together.
const bands = new Map();
for (const r of rows) {
  const key = `${r.map_id}|${r.run_id}|${r.global_x}|${r.global_y}|${r.global_w}|${r.global_h}`;
  if (!bands.has(key)) bands.set(key, []);
  bands.get(key).push(r);
}

let planned = 0;
let held = 0;
for (const [key, band] of bands) {
  if (band.length < 3) {
    held++;
    continue;
  }
  const h = band[0].global_h;
  const pitch = h / band.length;
  if (pitch < 8 || pitch > h / 2) {
    held++;
    continue;
  }
  // Printed order. The number is what the paper prints down the column, and it
  // is the only ordering here that survives a row being re-read out of order.
  band.sort((a, b) => (numberOf(a.notes) || 0) - (numberOf(b.notes) || 0));
  console.log(`${key.slice(0, 45)}… ${band.length} lines, pitch ${pitch.toFixed(1)}px`);
  planned += band.length;
  if (!apply) continue;
  for (const [i, r] of band.entries()) {
    const { error } = await db
      .from('ocr_extractions')
      .update({
        global_y: Math.round(r.global_y + i * pitch),
        global_h: Math.max(1, Math.round(pitch)),
      })
      .eq('id', r.id);
    if (error) throw error;
  }
}
console.log(
  `${apply ? 'split' : 'would split'} ${planned} row(s) across ${bands.size - held} band(s); ` +
    `${held} band(s) held back as too short or too tight to divide`
);
