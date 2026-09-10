/**
 * Runs the REAL area-ratio metres-per-pixel estimator out of
 * `scripts/collection_aoi.mjs`, offline, and prints the number it produces.
 *
 * Why a harness rather than an import: that estimator lives in `aoiInPixels()`,
 * which is not exported, and the module is a script — it opens a Supabase client
 * and queries `maps` at the top level, then `process.exit(0)`s. Importing it for
 * one function is not possible, and the file is not ours to refactor. So this
 * stands in for the network and the database and lets the script run as written:
 * every line of the arithmetic under test is the shipped line, including
 * `ringArea`, the degrees-to-metres constants and the Allmaps transform.
 *
 * That unreachability is itself the finding behind this fixture. The two
 * estimators had never been fed the same input because one of them could not be
 * called without a live database.
 *
 * Usage: node tests/fixtures/mppAoiHarness.mjs <fixture.json> [aoi.geojson]
 * Prints one line of JSON: { mpp, cov, rect, w, h }.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(new URL(import.meta.url).pathname);
const repo = resolve(here, '../..');

const fixturePath = process.argv[2] ?? resolve(here, 'mpp-parity-l7014-6330-4.json');
const aoiPath = process.argv[3] ?? resolve(repo, 'work/analysis/district4/district4.geojson');
const fx = JSON.parse(readFileSync(fixturePath, 'utf8'));

// The one map row the script will see. `bbox` is the georeferenced extent, taken
// from the annotation's own control points, so nothing here is invented: the
// script's `coverage()` gate needs a bbox and this is the sheet's.
const MAP_ROW = {
  id: '00000000-0000-4000-8000-000000000001',
  name: fx.sheet,
  year: 1965,
  status: 'public',
  bbox: fx.gcp_bbox,
  iiif_image: 'https://fixture.invalid/iiif/sheet',
  allmaps_id: null,
  annotation_url: 'https://fixture.invalid/annotation',
  source_type: 'iiif',
};

const json = (obj) =>
  new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

globalThis.fetch = async (input) => {
  const url = String(input?.url ?? input);
  if (url.includes('/rest/v1/maps')) return json([MAP_ROW]);
  if (url.endsWith('/info.json')) return json(fx.iiif_info);
  if (url.includes('/annotation')) return json(fx.annotation);
  throw new Error(`harness: unexpected fetch ${url} — no network is allowed here`);
};

// The script's gates are about picking sheets to spend money on; this fixture is
// about the number, so open them and let the one sheet through.
process.argv = [
  process.argv[0],
  resolve(repo, 'scripts/collection_aoi.mjs'),
  '--aoi',
  aoiPath,
  '--json',
  '--min-cov',
  '0',
  '--max-mpp',
  '1e9',
];
process.env.PUBLIC_SUPABASE_URL = 'https://fixture.invalid';
process.env.SUPABASE_SERVICE_KEY = 'fixture-service-key';

const EXIT = Symbol('exit');
process.exit = () => {
  throw Object.assign(new Error('harness: script called process.exit'), { [EXIT]: true });
};

let captured = '';
const realLog = console.log;
console.log = (...a) => {
  captured += a.join(' ') + '\n';
};

try {
  await import(pathToFileURL(resolve(repo, 'scripts/collection_aoi.mjs')).href);
} catch (err) {
  if (!err?.[EXIT]) {
    console.log = realLog;
    throw err;
  }
}
console.log = realLog;

const parsed = JSON.parse(captured);
const row = parsed.picked[0] ?? parsed.rejected[0];
if (!row) throw new Error(`harness: the script selected no sheet\n${captured}`);
console.log(JSON.stringify({ mpp: row.mpp, cov: row.cov, rect: row.rect, w: row.w, h: row.h }));
