#!/usr/bin/env node
/**
 * Repoint maps.thumbnail at a size the R2 pyramid actually holds.
 *
 * mirror-r2 used to write `full/256,` — a width-only size that vips dzsave
 * never emits, so the worker missed R2 and proxied every card thumbnail back
 * to archive.org (and served a 404 when the origin flaked). `full/800,` is
 * written by tile_map.sh for exactly this reason.
 *
 * Dry run by default; pass --apply to write.
 */
const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error('Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY (node --env-file=.env)');

const apply = process.argv.includes('--apply');
const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const maps = await fetch(
  `${url}/rest/v1/maps?select=id,name,thumbnail&thumbnail=like.*maparchive.vn*full/256,*`,
  { headers: h }
).then((r) => r.json());

console.log(`${maps.length} map(s) with a 256,-wide thumbnail\n`);

let ok = 0;
for (const m of maps) {
  const next = `https://iiif.maparchive.vn/iiif/${m.id}/full/800,/0/default.jpg`;
  // Only repoint at a URL the bucket can actually serve.
  const probe = await fetch(next, { method: 'HEAD' });
  const live = probe.headers.get('cache-control')?.includes('31536000');
  if (!probe.ok || !live) {
    console.log(`SKIP ${m.id} ${m.name} — ${probe.status}, not in R2 (needs tile_map.sh)`);
    continue;
  }
  if (apply) {
    const res = await fetch(`${url}/rest/v1/maps?id=eq.${m.id}`, {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ thumbnail: next }),
    });
    if (!res.ok) { console.log(`FAIL ${m.id} ${res.status} ${await res.text()}`); continue; }
  }
  console.log(`${apply ? 'SET ' : 'WOULD SET'} ${m.id} ${m.name}`);
  ok++;
}
console.log(`\n${ok} ${apply ? 'updated' : 'to update'}${apply ? '' : ' — rerun with --apply'}`);
