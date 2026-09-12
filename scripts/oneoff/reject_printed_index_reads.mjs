// Reject the tile pass's reads that landed inside a sheet's *printed* blocks —
// the numbered legend, the street directory. Those blocks are tables about the
// map, not the map, and the `legend` / `street-index` passes read them properly.
// The tile pass had no way to know: a tile showing "52  C 10  Marche Central"
// looks exactly like a numeral stamped on a building.
//
// On the 1942 Saigon–Cho Lon sheet this is 1535 of 4052 rows — 630 institutions
// and 719 streets, all of them the directory's own text pinned to the margin,
// plus the index column's numbers 1..29 sitting in `legend_ref`.
//
// Rejects rather than deletes: `set_extraction_status` is reversible, and a row
// a reviewer already validated is left alone.
//
// Dry run by default. `--apply` writes. `--map <uuid>` narrows to one sheet.
import { createClient } from '@supabase/supabase-js';

const PRINTED_BLOCKS = new Set(['legend', 'name_list']);
const apply = process.argv.includes('--apply');
const mapArg = process.argv.indexOf('--map');
const onlyMap = mapArg === -1 ? null : process.argv[mapArg + 1];

const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Same test as `in_rects` in work/ocr/scripts/ocr.py: the read's centre, not its
// corner, so a mark clipping a block's edge belongs to whichever side holds it.
const inside = (rects, r) => {
  const cx = r.global_x + (r.global_w ?? 0) / 2;
  const cy = r.global_y + (r.global_h ?? 0) / 2;
  return rects.some(([x, y, w, h]) => cx >= x && cx < x + w && cy >= y && cy < y + h);
};

const { data: maps, error } = await db.from('maps').select('id, name, triage');
if (error) throw error;

let total = 0;
for (const m of maps ?? []) {
  if (onlyMap && m.id !== onlyMap) continue;
  const rects = (m.triage?.regions ?? [])
    .filter((r) => PRINTED_BLOCKS.has(r.category))
    .map((r) => r.bbox);
  if (!rects.length) continue;

  // Page explicitly: PostgREST caps a response at 1000 rows, and a sheet with a
  // directory has thousands. Counting the first page only is how this reads as
  // "35 rows" on a sheet with 1535.
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await db
      .from('ocr_extractions')
      .select('id, category, status, global_x, global_y, global_w, global_h')
      .eq('map_id', m.id)
      .neq('category', 'legend_entry') // the legend pass's own output lives there
      .range(from, from + 999);
    if (e) throw e;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const hits = rows.filter((r) => r.status !== 'validated' && inside(rects, r));
  if (!hits.length) continue;
  const by = {};
  for (const h of hits) by[h.category] = (by[h.category] ?? 0) + 1;
  console.log(`${m.name} (${m.id.slice(0, 8)}): ${hits.length}/${rows.length}`, by);
  total += hits.length;

  if (apply) {
    for (let i = 0; i < hits.length; i += 200) {
      const { error: e } = await db.rpc('set_extraction_status', {
        p_status: 'rejected',
        p_user: null,
        p_ids: hits.slice(i, i + 200).map((h) => h.id),
      });
      if (e) throw e;
    }
  }
}
console.log(apply ? `rejected ${total}` : `would reject ${total} — pass --apply`);
