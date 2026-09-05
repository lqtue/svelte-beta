// ---- Allmaps annotation URL resolver ----
// Lives in $lib/core/iiif (not $lib/map/shell) so pure utilities — geo/mapBounds,
// iiif/iiifImageInfo — can resolve an annotation source without pulling
// @allmaps/openlayers (and the whole WarpedMapLayer bundle) in with them.

/**
 * Builds the Allmaps annotation URL for a given source.
 *
 * - Bare hex IDs → `https://annotations.allmaps.org/images/{id}`
 * - Full URLs passed through as-is (e.g. an R2/Supabase-mirrored annotation)
 */
export function annotationUrlForSource(source: string): string {
  const trimmed = source.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return trimmed;
  } catch {
    // not a URL — treat as Allmaps image ID
  }
  return `https://annotations.allmaps.org/images/${trimmed}`;
}

/**
 * XYZ tile template for a georeferenced map, served warped by the Allmaps
 * tile server. Paste-able into any editor that takes `{z}/{x}/{y}` — iD on
 * OpenHistoricalMap, JOSM, QGIS.
 *
 * ponytail: leans on allmaps.xyz, a free public service. Self-host
 * @allmaps/tileserver on the R2 worker if it ever rate-limits us.
 */
export function allmapsTileUrl(source: string): string {
  return `https://allmaps.xyz/{z}/{x}/{y}.png?url=${encodeURIComponent(annotationUrlForSource(source))}`;
}
