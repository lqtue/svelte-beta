/**
 * GET /api/export/footprints
 *
 * Exports building footprints as GeoJSON, converting pixel coordinates to
 * WGS84 via the Allmaps georeference annotation for each task's map.
 *
 * Query params:
 *   task_id  — optional, filter to one task
 *   status   — optional, default 'submitted' (all valid: submitted|consensus|verified)
 *   format   — 'geojson' (default) | 'coco' (COCO JSON for ML training)
 *
 * Pixel → WGS84 pipeline:
 *   pixel_polygon [[x,y],...] stored in DB (IIIF pixel space, y+ down)
 *   → GcpTransformer.fromGeoreferencedMap(map).transformForward(point)
 *   → [lng, lat] WGS84
 *
 * The pixel_polygon is also preserved in feature.properties so callers can
 * re-project with an updated annotation without re-tracing.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { GcpTransformer } from '@allmaps/transform';
import { parseAnnotation } from '@allmaps/annotation';
import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY
} from '$env/static/public';

// Cache transformer per annotation URL within a request (simple map)
const transformerCache = new Map<string, GcpTransformer>();

async function getTransformer(annotationUrl: string): Promise<GcpTransformer | null> {
  if (transformerCache.has(annotationUrl)) {
    return transformerCache.get(annotationUrl)!;
  }
  try {
    const res = await fetch(annotationUrl);
    if (!res.ok) return null;
    const annotation = await res.json();
    const maps = parseAnnotation(annotation);
    if (!maps.length) return null;
    const transformer = GcpTransformer.fromGeoreferencedMap(maps[0] as any);
    transformerCache.set(annotationUrl, transformer);
    return transformer;
  } catch {
    return null;
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const taskId = url.searchParams.get('task_id');
  const status = url.searchParams.get('status') || 'submitted';
  const format = url.searchParams.get('format') || 'geojson';

  const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

  const mapId = url.searchParams.get('map_id');

  // Fetch footprints — join label_tasks for volunteer rows; SAM rows have map_id directly
  let fpQuery = supabase
    .from('footprint_submissions')
    .select('*, label_tasks(map_id, allmaps_id)')
    .eq('status', status);

  if (taskId) fpQuery = fpQuery.eq('task_id', taskId);
  if (mapId)  fpQuery = fpQuery.eq('map_id', mapId);

  const { data: rows, error: dbError } = await fpQuery;
  if (dbError) throw error(500, dbError.message);

  // Group by task to batch transformer lookups
  const features: GeoJSON.Feature[] = [];
  const cocoAnnotations: any[] = [];
  let cocoAnnId = 1;

  for (const row of rows as any[]) {
    // Resolve allmaps_id — SAM rows store it directly; volunteer rows via label_tasks join
    const task = row.label_tasks;
    const resolvedAllmapsId = row.allmaps_id ?? task?.allmaps_id;
    if (!resolvedAllmapsId) continue;

    const annotationUrl = `https://annotations.allmaps.org/maps/${resolvedAllmapsId}`;
    const transformer = await getTransformer(annotationUrl);

    const pixelRing: [number, number][] = row.pixel_polygon;

    if (format === 'geojson') {
      let coordinates: [number, number][];

      if (transformer) {
        // Transform each pixel point to WGS84
        coordinates = pixelRing.map(([px, py]) => {
          // @allmaps/types Point = [number, number]; resource (pixel) → geo (WGS84)
          const [lng, lat] = transformer.transformToGeo([px, py] as [number, number]);
          return [lng, lat] as [number, number];
        });
        // Close the ring
        if (coordinates.length > 0) {
          coordinates.push(coordinates[0]);
        }
      } else {
        // Fallback: include feature without geo conversion, flag in properties
        coordinates = pixelRing.map(([x, y]) => [x, y] as [number, number]);
      }

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates]
        },
        properties: {
          id: row.id,
          task_id: row.task_id,
          map_id: row.map_id ?? task?.map_id,
          allmaps_id: resolvedAllmapsId,
          label: row.label,
          feature_type: row.feature_type,
          source: row.source,
          valid_from: row.valid_from,
          valid_to: row.valid_to,
          confidence: row.confidence,
          temporal_status: row.temporal_status,
          status: row.status,
          pixel_polygon: pixelRing,
          geo_converted: !!transformer,
          created_at: row.created_at
        }
      });
    } else if (format === 'coco') {
      // COCO polygon format: flat [x1, y1, x2, y2, ...]
      const segmentation = pixelRing.flatMap(([x, y]) => [x, y]);
      // Bounding box from pixel coords
      const xs = pixelRing.map(([x]) => x);
      const ys = pixelRing.map(([, y]) => y);
      const xMin = Math.min(...xs), yMin = Math.min(...ys);
      const xMax = Math.max(...xs), yMax = Math.max(...ys);

      cocoAnnotations.push({
        id: cocoAnnId++,
        footprint_id: row.id,
        task_id: row.task_id,
        allmaps_id: task.allmaps_id,
        category: row.label || 'building',
        segmentation: [segmentation],
        bbox: [xMin, yMin, xMax - xMin, yMax - yMin],
        area: (xMax - xMin) * (yMax - yMin),
        iscrowd: 0
      });
    }
  }

  transformerCache.clear();

  if (format === 'coco') {
    return json({
      info: {
        description: 'Vietnam Map Archive — Building Footprints',
        version: '1.0',
        year: 2026,
        contributor: 'VMA Community',
        url: 'https://vietnammaps.org'
      },
      categories: [{ id: 1, name: 'building', supercategory: 'none' }],
      annotations: cocoAnnotations
    });
  }

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features
  };

  return new Response(JSON.stringify(geojson, null, 2), {
    headers: {
      'Content-Type': 'application/geo+json',
      'Content-Disposition': 'attachment; filename="vma-footprints.geojson"'
    }
  });
};
