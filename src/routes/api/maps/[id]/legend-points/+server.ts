/**
 * GET /api/maps/[id]/legend-points
 *
 * Public. Returns the map's numbered-legend references placed on the ground:
 * each body numeral (category 'legend_ref') warped to lng/lat via the map's
 * Allmaps georeference, joined to its legend entry (category 'legend_entry')
 * for a name. Legend-internal numbers (those inside the legend box) are
 * dropped — only numerals out on the map body are returned.
 *
 * Response: { points: [{ n, name, vn, grid, lng, lat }], reason? }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { GcpTransformer } from '@allmaps/transform';
import { parseAnnotation } from '@allmaps/annotation';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';

export const GET: RequestHandler = async ({ params }) => {
  const mapId = params.id;
  const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: map } = await supabase
    .from('maps')
    .select('allmaps_id, annotation_url')
    .eq('id', mapId)
    .single();
  if (!(map as any)?.allmaps_id) return json({ points: [], reason: 'not georeferenced' });

  // Legend entries → number→name map + the legend box rect (shared tile bbox).
  const { data: entries } = await supabase
    .from('ocr_extractions')
    .select('text, notes, tile_x, tile_y, tile_w, tile_h')
    .eq('map_id', mapId)
    .eq('category', 'legend_entry');

  const nameByN = new Map<number, { name: string; vn: string | null; grid: string | null }>();
  let rect: { x: number; y: number; w: number; h: number } | null = null;
  for (const e of (entries ?? []) as any[]) {
    const m = /^(\d+)\.\s*(.*)$/.exec(e.text ?? '');
    const n = m ? parseInt(m[1], 10) : parseInt(/n=(\d+)/.exec(e.notes ?? '')?.[1] ?? '', 10);
    if (!Number.isFinite(n)) continue;
    const grid = /grid=([^;]+)/.exec(e.notes ?? '')?.[1]?.trim() ?? null;
    const vn = /vn=([^;]+)/.exec(e.notes ?? '')?.[1]?.trim() ?? null;
    nameByN.set(n, { name: m ? m[2] : (e.text ?? ''), vn, grid });
    if (!rect && e.tile_w) rect = { x: e.tile_x, y: e.tile_y, w: e.tile_w, h: e.tile_h };
  }
  const maxN = nameByN.size ? Math.max(...nameByN.keys()) : 0;

  // Feature-reference numerals: bare digits sitting out on the map body. Gemini
  // tags them 'other'; the old Tesseract pass used 'legend_ref'. Either way the
  // digit + ≤maxN + outside-legend-box filters below isolate the real refs.
  const { data: refs } = await supabase
    .from('ocr_extractions')
    .select('text, global_x, global_y, global_w, global_h')
    .eq('map_id', mapId)
    .in('category', ['legend_ref', 'other']);

  // Build the pixel→geo transformer from the stored annotation (mirror override
  // first, else the public Allmaps annotation).
  const annUrl = (map as any).annotation_url || `https://annotations.allmaps.org/maps/${(map as any).allmaps_id}`;
  let transformer: GcpTransformer | null = null;
  try {
    const res = await fetch(annUrl);
    if (res.ok) {
      const maps = parseAnnotation(await res.json());
      if (maps.length) transformer = GcpTransformer.fromGeoreferencedMap(maps[0] as any);
    }
  } catch {
    /* fall through to empty */
  }
  if (!transformer) return json({ points: [], reason: 'no annotation' });

  const inRect = (x: number, y: number) =>
    rect !== null && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

  const points: Array<{ n: number; name: string | null; vn: string | null; grid: string | null; lng: number; lat: number }> = [];
  for (const r of (refs ?? []) as any[]) {
    const t = (r.text ?? '').trim();
    if (!/^\d+$/.test(t)) continue;
    const n = parseInt(t, 10);
    if (n < 1 || n > maxN) continue; // only numerals that name a legend entry
    const cx = r.global_x + (r.global_w || 0) / 2;
    const cy = r.global_y + (r.global_h || 0) / 2;
    if (inRect(cx, cy)) continue; // drop legend-internal column numbers
    const [lng, lat] = transformer.transformToGeo([cx, cy]);
    const info = nameByN.get(n);
    points.push({ n, name: info?.name ?? null, vn: info?.vn ?? null, grid: info?.grid ?? null, lng, lat });
  }

  return json({ points });
};
