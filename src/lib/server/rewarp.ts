/**
 * rewarp.ts — refill a map's derived geometry after its georeference moves.
 *
 * The writers warp on the way in (`$lib/server/warp.ts`), which covers every
 * row written while a map's GCPs stand still. Re-georeferencing invalidates all
 * of them at once, and enqueuing one `warp` job is cheaper and more honest than
 * trying to patch rows from the editor. This is that job's body; it is also
 * what backfills a map whose rows were written before it was georeferenced at
 * all, which is most of the corpus.
 */

import { adminClient } from './supabaseAdmin';
import { bboxCentre, pointEwkt, polygonEwkt, resolveMapWarp } from './warp';

export interface RewarpResult {
  map_id: string;
  geom_src: string | null;
  geom_rmse: number | null;
  labels: number;
  footprints: number;
  /** Rows the transform refused: a line trace, or a point outside the GCP hull. */
  skipped: number;
  reason?: string;
}

/** ponytail: one statement per row. At a few thousand rows per map that is fine; batch it if a map ever holds 10^5. */
export async function rewarpMap(mapId: string): Promise<RewarpResult> {
  const supabase = adminClient();
  const empty = {
    map_id: mapId,
    geom_src: null,
    geom_rmse: null,
    labels: 0,
    footprints: 0,
    skipped: 0,
  };

  const { data: map } = await supabase
    .from('maps')
    .select('allmaps_id, annotation_url')
    .eq('id', mapId)
    .single();
  if (!map) return { ...empty, reason: 'no such map' };

  const warp = await resolveMapWarp(map.allmaps_id, map.annotation_url);
  if (!warp) return { ...empty, reason: 'no usable annotation' };

  let labels = 0;
  let footprints = 0;
  let skipped = 0;

  const { data: extractions } = await supabase
    .from('ocr_extractions')
    .select('id, global_x, global_y, global_w, global_h, geom_src')
    .eq('map_id', mapId);

  for (const row of extractions ?? []) {
    if (row.geom_src === warp.src) continue; // already warped against this georeference
    const centre = bboxCentre(row);
    const geom = centre ? pointEwkt(warp, centre) : null;
    if (!geom) {
      skipped++;
      continue;
    }
    const { error } = await supabase
      .from('ocr_extractions')
      .update({ geom, geom_src: warp.src, geom_rmse: warp.rmse })
      .eq('id', row.id);
    if (error) skipped++;
    else labels++;
  }

  const { data: prints } = await supabase
    .from('footprint_submissions')
    .select('id, pixel_polygon, geom_src')
    .eq('map_id', mapId);

  for (const row of prints ?? []) {
    if (row.geom_src === warp.src) continue;
    const ring = row.pixel_polygon as unknown as [number, number][] | null;
    const geom = ring ? polygonEwkt(warp, ring) : null;
    if (!geom) {
      skipped++;
      continue;
    }
    const { error } = await supabase
      .from('footprint_submissions')
      .update({ geom, geom_src: warp.src, geom_rmse: warp.rmse })
      .eq('id', row.id);
    if (error) skipped++;
    else footprints++;
  }

  return { map_id: mapId, geom_src: warp.src, geom_rmse: warp.rmse, labels, footprints, skipped };
}
