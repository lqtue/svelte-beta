import { INK } from '$lib/core/ink';

// Legend items: simple string ("Building") or transcription object ({val: "1", label: "Abattoir Municipal"})
export type LegendItem = string | { val: string; label: string };

// [x, y] pairs in IIIF pixel space (y+ = down, matching IIIF convention)
export type PixelCoord = [number, number];

// Geometry type — determines Polygon vs LineString rendering
// Polygon: building, land_plot, green_space, water_body
// LineString: road, waterway
export type FeatureType =
  | 'building'
  | 'land_plot'
  | 'road'
  | 'waterway'
  | 'green_space' // parks, gardens, cemeteries
  | 'water_body' // lakes, ponds (area, not flowing)
  | 'other';

export const FEATURE_TYPE_LABELS: Record<FeatureType, string> = {
  building: 'Building',
  land_plot: 'Land Plot',
  road: 'Road',
  waterway: 'Waterway',
  green_space: 'Green Space',
  water_body: 'Water Body',
  other: 'Other',
};

/**
 * One colour per feature type, for every surface that shows footprints.
 *
 * Until Sept 2026 there were three of these — the /explore layer, the trace
 * sidebar and the review sidebar each had their own, so a building was green
 * on the map, gold in one list and blue in the other. These are the /explore
 * values, because that is the public surface.
 */
export const FEATURE_TYPE_COLORS: Record<FeatureType, string> = {
  building: INK.green,
  land_plot: INK.yellow,
  road: INK.red,
  waterway: INK.blue,
  green_space: INK.olive,
  water_body: INK.blue,
  other: INK.slate,
};

/** Canvas fill opacity per type — a road wants less ink than a building. */
const FILL_ALPHA: Record<FeatureType, number> = {
  building: 0.35,
  land_plot: 0.25,
  road: 0.3,
  waterway: 0.35,
  green_space: 0.3,
  water_body: 0.3,
  other: 0.3,
};

/** `rgba(...)` fill for OpenLayers, which takes colour strings and not tokens. */
export function featureTypeFill(ft: string): string {
  const key = (ft in FEATURE_TYPE_COLORS ? ft : 'other') as FeatureType;
  const n = parseInt(FEATURE_TYPE_COLORS[key].slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${FILL_ALPHA[key]})`;
}

// Geometry kind derived from feature type
export function geometryKind(ft: FeatureType): 'Polygon' | 'LineString' {
  return ft === 'road' || ft === 'waterway' ? 'LineString' : 'Polygon';
}

export interface FootprintSubmission {
  id: string;
  mapId: string;
  userId: string;
  pixelPolygon: PixelCoord[]; // closed ring for Polygon, open sequence for LineString
  name: string | null;
  category: string | null;
  featureType: FeatureType;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
}
