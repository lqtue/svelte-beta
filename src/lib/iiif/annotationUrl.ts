// ---- Allmaps annotation URL resolver ----
// Lives in $lib/iiif (not $lib/shell) so pure utilities — geo/mapBounds,
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
