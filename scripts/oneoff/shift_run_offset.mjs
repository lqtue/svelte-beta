// Shift every extraction of one run by a constant, in source pixels.
//
// Why this exists: map eca788e5 (1942 Saigon–Cho Lon) moved onto a 2x scan in
// `rescan_1942_to_2x.mjs`. That transform fits the annotation to ±7 px, but the
// extractions it rescaled land short: of 352 texts that appear exactly once in
// each of the two runs, **288 sit (+89, +159) apart** — one constant, not a
// scatter. Checked against the ink: the numeral `19` is where run
// `idx2x-20260912` puts it, and run `2026-09-11-idx` points up-and-left of it
// by that same shift. So the older run needs the shift added, not the newer one
// corrected.
//
// Re-measure before trusting the numbers on any other sheet — a residual like
// this is a property of one rescan, not of the pipeline.
//
// Dry run by default. `--apply` writes.
import { createClient } from '@supabase/supabase-js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const apply = process.argv.includes('--apply');
const mapId = arg('--map', 'eca788e5-6780-4dca-bf23-7651a1c48aba');
const runId = arg('--run', '2026-09-11-idx');
const dx = Number(arg('--dx', 89));
const dy = Number(arg('--dy', 159));

const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from('ocr_extractions')
    .select('id, global_x, global_y')
    .eq('map_id', mapId)
    .eq('run_id', runId)
    .range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}

console.log(
  `${runId}: ${rows.length} rows, shifting by (${dx >= 0 ? '+' : ''}${dx}, ${dy >= 0 ? '+' : ''}${dy}) px`
);
if (!apply) {
  console.log('dry run — pass --apply');
  process.exit(0);
}

// One PATCH per row: `global_xi`/`global_yi` are generated from global_x/y, so
// the unique index moves with the row and an upsert is not what is wanted here.
for (const r of rows) {
  // The label rectangle is size + angle (`label_w`/`label_h`/`rotation_deg`)
  // around this same point, so moving the point carries it.
  const { error } = await db
    .from('ocr_extractions')
    .update({ global_x: r.global_x + dx, global_y: r.global_y + dy })
    .eq('id', r.id);
  if (error) throw error;
}
console.log(`shifted ${rows.length}`);
