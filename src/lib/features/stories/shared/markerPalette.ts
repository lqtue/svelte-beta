/**
 * markerPalette.ts — colours + label font for the numbered story markers.
 *
 * OpenLayers styles are built in JS, so they can't use CSS variables directly.
 * We read the tokens off :root once per call, and fall back to `INK` — the same
 * inks tokens.css defines — for the render that happens before a stylesheet has
 * landed.
 */
import { INK } from '$lib/core/ink';

export interface MarkerPalette {
  pending: string;
  current: string;
  done: string;
  border: string;
  label: string;
  font: string;
}

// Used only during SSR / before the stylesheet lands. These stand in for
// --sb-accent, --sb-accent-warm, --color-border and --color-white; `done` green
// has no token of its own (see --marker-done below).
const FALLBACK: MarkerPalette = {
  pending: INK.blue,
  current: INK.yellow,
  done: INK.green,
  border: INK.ink,
  label: INK.paper,
  font: "'Space Grotesk', system-ui, sans-serif",
};

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function markerPalette(): MarkerPalette {
  return {
    // `--marker-*` lets a theme override the markers on their own; without one
    // they track the sidebar accents, which is where the literals came from.
    pending: cssVar('--marker-pending', cssVar('--sb-accent', FALLBACK.pending)),
    current: cssVar('--marker-current', cssVar('--sb-accent-warm', FALLBACK.current)),
    done: cssVar('--marker-done', FALLBACK.done),
    border: cssVar('--color-border', FALLBACK.border),
    label: cssVar('--color-white', FALLBACK.label),
    font: cssVar('--font-family-display', FALLBACK.font),
  };
}
