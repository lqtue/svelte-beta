/**
 * markerPalette.ts — colours + label font for the numbered story markers.
 *
 * OpenLayers styles are built in JS, so they can't use CSS variables directly.
 * We read the tokens off :root once per call and fall back to the literals the
 * markers used before the two marker layers were merged.
 */
export interface MarkerPalette {
  pending: string;
  current: string;
  done: string;
  border: string;
  label: string;
  font: string;
}

const FALLBACK: MarkerPalette = {
  pending: '#2563eb',
  current: '#f59e0b',
  done: '#16a34a',
  border: '#111',
  label: '#fff',
  font: "'Space Grotesk', sans-serif",
};

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function markerPalette(): MarkerPalette {
  return {
    pending: cssVar('--marker-pending', FALLBACK.pending),
    current: cssVar('--marker-current', FALLBACK.current),
    done: cssVar('--marker-done', FALLBACK.done),
    border: cssVar('--color-border', FALLBACK.border),
    label: cssVar('--color-white', FALLBACK.label),
    font: cssVar('--font-family-display', FALLBACK.font),
  };
}
