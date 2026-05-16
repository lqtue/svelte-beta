#!/usr/bin/env node
import { readFileSync } from 'fs';
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split('=').map(s=>s.trim())).filter(([k])=>k));
const r = await fetch(`${env.PUBLIC_SUPABASE_URL}/rest/v1/maps?select=id,name,source_type,iiif_manifest,iiif_image,source_url,allmaps_id,extra_metadata&source_type=in.(bnf,ia)&order=source_type.asc`, {
  headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` }
});
const rows = await r.json();
for (const m of rows) {
  console.log(`[${m.source_type}] ${m.id.slice(0,8)} ${m.name.slice(0,50)}`);
  console.log(`  manifest: ${m.iiif_manifest || '(none)'}`);
  console.log(`  source_url: ${m.source_url || '(none)'}`);
  console.log(`  iiif_image: ${(m.iiif_image||'').slice(0,90)}`);
}
console.log(`\ntotal: ${rows.length}`);
