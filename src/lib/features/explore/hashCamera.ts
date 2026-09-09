/**
 * True when a `#…` hash carries a camera — `#@<lat>,<lng>,…`.
 *
 * urlStore reads that camera on init, and then `?map=` used to throw it away:
 * `zoomToMap(..., { force: true })` refit the view to the sheet's own bounds,
 * so every share link opened zoomed out at the whole sheet instead of the
 * frame its sender had picked. It also left that first zoomed-out frame on the
 * Allmaps canvas, which is where the shrunken copy of the sheet in the corner
 * came from.
 *
 * Its own file, free of `$app/navigation`, so the predicate is testable
 * outside a browser — `exploreUrl.ts` is not.
 */
export function hasHashCamera(hash: string): boolean {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  return /^@-?\d+(\.\d+)?,-?\d+(\.\d+)?/.test(raw);
}
