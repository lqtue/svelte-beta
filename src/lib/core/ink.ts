/**
 * The canvas palette — the plate-tone inks, in a form OpenLayers can read.
 *
 * `tokens.css` is the source of truth for anything the browser paints from a
 * stylesheet. OL style objects are not painted from a stylesheet: they are
 * canvas draw calls, and `var(--color-blue)` means nothing to them. So the
 * same inks live here too, and this file is the only place they are repeated.
 *
 * The first ten mirror tokens.css exactly. The last four exist because the
 * categorical maps below need more hues than the six accents a page uses —
 * they are in the same register (a printable ink on an aged sheet, never a
 * screen-saturated hue), so a legend built from all fourteen still reads as
 * one palette. Nothing here is a UI surface, so the gate is telling two
 * categories apart on a scanned map, not text contrast.
 */
export const INK = {
  paper: '#f7f5f0',
  ink: '#1a1a17',
  rule: '#7d7869',
  grey: '#66614f',
  red: '#a63a2b',
  blue: '#2f5d78',
  yellow: '#e0b544',
  green: '#3d6b4a',
  orange: '#a85f2b',
  purple: '#5a4b80',
  teal: '#2f6f6a',
  plum: '#7a3350',
  olive: '#6b6a2f',
  slate: '#5c5f66',
} as const;

/**
 * An ink at partial strength, in the `rgba()` string OL wants. Canvas fills
 * used to carry their own literals — `rgba(245, 158, 11, 0.15)` for a draw
 * preview, `rgba(255, 107, 53, 0.2)` for a selection — both pre-plate-tone
 * hues that no longer matched the stroke drawn over them.
 */
export function inkAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Cycled per distinct label when the thing being drawn has no category of its
 * own — one sheet's footprints, say. Ordered so neighbours in the cycle are
 * far apart in hue, because consecutive labels land next to each other.
 */
export const INK_CYCLE: readonly string[] = [
  INK.blue,
  INK.red,
  INK.green,
  INK.purple,
  INK.orange,
  INK.teal,
  INK.plum,
  INK.olive,
  INK.yellow,
  INK.slate,
];
