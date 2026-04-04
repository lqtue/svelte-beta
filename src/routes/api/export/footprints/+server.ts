/**
 * GET /api/export/footprints
 *
 * Exports volunteer-traced and SAM-generated building footprints.
 *
 * Query params:
 *   map_id   — required for coco format, optional for geojson
 *   task_id  — optional, filter to one task
 *   status   — default 'submitted'
 *   format   — 'geojson' (default) | 'coco'
 *   pad      — COCO only: pixel padding around each crop bbox (default 128)
 *   size     — COCO only: IIIF output size for image crops (default 1024)
 *
 * COCO format returns a complete dataset ready for segmentation training:
 *   images[]      — one entry per footprint with IIIF crop URL + dimensions
 *   annotations[] — polygon segmentation relative to each crop
 *   categories[]  — feature_type classes
 *
 * Usage in Colab:
 *   coco = requests.get('.../api/export/footprints?format=coco&map_id=<uuid>').json()
 *   # Each image has coco['images'][i]['iiif_url'] — fetch it to get the image crop
 *   # Polygon is already crop-relative in coco['annotations'][i]['segmentation']
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

interface AnnotationData {
  transformer: GcpTransformer;
  iiifBaseUrl: string; // IIIF image service base URL (for region crop requests)
}

const annotationCache = new Map<string, AnnotationData>();

async function getAnnotationData(allmapsId: string): Promise<AnnotationData | null> {
  const annotationUrl = `https://annotations.allmaps.org/maps/${allmapsId}`;
  if (annotationCache.has(annotationUrl)) return annotationCache.get(annotationUrl)!;

  try {
    const res = await fetch(annotationUrl);
    if (!res.ok) return null;
    const annotation = await res.json();
    const maps = parseAnnotation(annotation);
    if (!maps.length) return null;

    const transformer = GcpTransformer.fromGeoreferencedMap(maps[0] as any);
    // IIIF image service base URL lives at items[0].target.source.id in the annotation
    const iiifBaseUrl = annotation.items?.[0]?.target?.source?.id as string | undefined;
    if (!iiifBaseUrl) return null;

    const data: AnnotationData = { transformer, iiifBaseUrl };
    annotationCache.set(annotationUrl, data);
    return data;
  } catch {
    return null;
  }
}

const CATEGORY_IDS: Record<string, number> = {
  building: 1,
  land_plot: 2,
  road: 3,
  waterway: 4,
  other: 5,
};

export const GET: RequestHandler = async ({ url }) => {
  const taskId = url.searchParams.get('task_id');
  const mapId = url.searchParams.get('map_id');
  const status = url.searchParams.get('status') || 'submitted';
  const format = url.searchParams.get('format') || 'geojson';
  const pad = parseInt(url.searchParams.get('pad') ?? '128', 10);
  const cropSize = parseInt(url.searchParams.get('size') ?? '1024', 10);

  if (format === 'coco' && !mapId) {
    throw error(400, 'map_id is required for coco format');
  }

  const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

  let fpQuery = supabase
    .from('footprint_submissions')
    .select('*, label_tasks(map_id, allmaps_id)')
    .eq('status', status);

  if (taskId) fpQuery = fpQuery.eq('task_id', taskId);
  if (mapId) fpQuery = fpQuery.eq('map_id', mapId);

  const { data: rows, error: dbError } = await fpQuery;
  if (dbError) throw error(500, dbError.message);

  // ── GeoJSON ──────────────────────────────────────────────────────────────

  if (format === 'geojson') {
    const features: GeoJSON.Feature[] = [];

    for (const row of rows as any[]) {
      const task = row.label_tasks;
      const resolvedAllmapsId = row.allmaps_id ?? task?.allmaps_id;
      if (!resolvedAllmapsId) continue;

      const annData = await getAnnotationData(resolvedAllmapsId);
      const pixelRing: [number, number][] = row.pixel_polygon;
      let coordinates: [number, number][];

      if (annData) {
        coordinates = pixelRing.map(([px, py]) => {
          const [lng, lat] = annData.transformer.transformToGeo([px, py]);
          return [lng, lat] as [number, number];
        });
        if (coordinates.length > 0) coordinates.push(coordinates[0]);
      } else {
        coordinates = pixelRing.map(([x, y]) => [x, y] as [number, number]);
      }

      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coordinates] },
        properties: {
          id: row.id,
          task_id: row.task_id,
          map_id: row.map_id ?? task?.map_id,
          allmaps_id: resolvedAllmapsId,
          label: row.label,
          feature_type: row.feature_type,
          source: row.source,
          valid_from: row.valid_from,
          confidence: row.confidence,
          status: row.status,
          pixel_polygon: pixelRing,
          geo_converted: !!annData,
          created_at: row.created_at,
        },
      });
    }

    annotationCache.clear();
    return new Response(JSON.stringify({ type: 'FeatureCollection', features }, null, 2), {
      headers: {
        'Content-Type': 'application/geo+json',
        'Content-Disposition': 'attachment; filename="vma-footprints.geojson"',
      },
    });
  }

  // ── COCO ─────────────────────────────────────────────────────────────────

  const cocoImages: any[] = [];
  const cocoAnnotations: any[] = [];
  let annId = 1;

  for (const row of rows as any[]) {
    const task = row.label_tasks;
    const resolvedAllmapsId = row.allmaps_id ?? task?.allmaps_id;
    if (!resolvedAllmapsId) continue;

    const annData = await getAnnotationData(resolvedAllmapsId);
    if (!annData) continue; // can't build crop URL without IIIF base

    const pixelRing: [number, number][] = row.pixel_polygon;
    if (!pixelRing?.length) continue;

    // Bounding box in IIIF pixel space
    const xs = pixelRing.map(([x]) => x);
    const ys = pixelRing.map(([, y]) => y);
    const xMin = Math.min(...xs), yMin = Math.min(...ys);
    const xMax = Math.max(...xs), yMax = Math.max(...ys);

    // Crop region with padding (clamped to non-negative)
    const cropX = Math.max(0, Math.round(xMin - pad));
    const cropY = Math.max(0, Math.round(yMin - pad));
    const cropW = Math.round(xMax - xMin + 2 * pad);
    const cropH = Math.round(yMax - yMin + 2 * pad);

    // IIIF Image API v2: {base}/{x,y,w,h}/{size},/0/default.jpg
    const iiifUrl = `${annData.iiifBaseUrl}/${cropX},${cropY},${cropW},${cropH}/${cropSize},/0/default.jpg`;

    const imageId = annId; // 1:1 image per annotation for simplicity

    cocoImages.push({
      id: imageId,
      footprint_id: row.id,
      map_id: row.map_id ?? task?.map_id,
      allmaps_id: resolvedAllmapsId,
      iiif_url: iiifUrl,
      iiif_base: annData.iiifBaseUrl,
      // Actual rendered dimensions (IIIF scales width to cropSize, height proportional)
      width: cropSize,
      height: Math.round((cropH / cropW) * cropSize),
      // Crop origin in original IIIF pixel space (needed to map back to geo)
      crop_x: cropX,
      crop_y: cropY,
      crop_w: cropW,
      crop_h: cropH,
      feature_type: row.feature_type,
      label: row.label,
      source: row.source,
      confidence: row.confidence,
      valid_from: row.valid_from,
    });

    // Scale factor: original crop pixels → rendered image pixels
    const scale = cropSize / cropW;

    // Segmentation polygon relative to crop, scaled to rendered size
    const relSeg = pixelRing.flatMap(([x, y]) => [
      Math.round((x - cropX) * scale),
      Math.round((y - cropY) * scale),
    ]);

    // Bbox relative to crop, scaled
    const relBbox = [
      Math.round((xMin - cropX) * scale),
      Math.round((yMin - cropY) * scale),
      Math.round((xMax - xMin) * scale),
      Math.round((yMax - yMin) * scale),
    ];

    const catId = CATEGORY_IDS[row.feature_type ?? 'building'] ?? 1;

    cocoAnnotations.push({
      id: annId,
      image_id: imageId,
      category_id: catId,
      segmentation: [relSeg],
      bbox: relBbox,
      area: relBbox[2] * relBbox[3],
      iscrowd: 0,
    });

    annId++;
  }

  annotationCache.clear();

  return json({
    info: {
      description: 'Vietnam Map Archive — Building Footprints (segmentation training)',
      version: '1.0',
      year: new Date().getFullYear(),
      contributor: 'VMA Community',
      url: 'https://vietnammaps.org',
      export_params: { status, pad, crop_size: cropSize },
    },
    categories: [
      { id: 1, name: 'building',   supercategory: 'structure' },
      { id: 2, name: 'land_plot',  supercategory: 'structure' },
      { id: 3, name: 'road',       supercategory: 'infrastructure' },
      { id: 4, name: 'waterway',   supercategory: 'infrastructure' },
      { id: 5, name: 'other',      supercategory: 'other' },
    ],
    images: cocoImages,
    annotations: cocoAnnotations,
  });
};
