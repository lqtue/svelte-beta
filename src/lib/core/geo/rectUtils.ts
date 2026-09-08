/**
 * rectUtils.ts — Shared utilities for handling rectangular bounding boxes
 * and pixel rings in image-pixel space with OpenLayers.
 *
 * Coordinate conventions:
 *   - image space is y-down, pixels from the top-left.
 *   - OL space is y-up: ol_y = -image_y.
 * Every flip in the contribute tools goes through one of these helpers.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Image-space point [x, y] → OL coordinate [x, -y]. */
export function toOlPoint([x, y]: readonly number[]): number[] {
  return [x, -y];
}

/** OL coordinate [ol_x, ol_y] → image-space point [x, y]. */
export function olPointToImage(olCoord: readonly number[]): [number, number] {
  return [olCoord[0], -olCoord[1]];
}

/** Image-space ring/line → OL coordinates. */
export function toOlCoords(points: readonly (readonly number[])[]): number[][] {
  return points.map(toOlPoint);
}

/** OL coordinates → image-space points. */
export function olCoordsToImage(coords: readonly (readonly number[])[]): [number, number][] {
  return coords.map(olPointToImage);
}

/**
 * Converts image-space [x, y, w, h] to an OpenLayers LinearRing (array of points).
 * Accounting for OL y-flipping (image_y = -ol_y).
 */
export function toOlRing(x: number, y: number, w: number, h: number): number[][] {
  return [
    [x, -y],
    [x + w, -y],
    [x + w, -(y + h)],
    [x, -(y + h)],
    [x, -y],
  ];
}

/** Image-space [x, y, w, h] → OL extent [minX, minY, maxX, maxY]. */
export function toOlExtent(
  x: number,
  y: number,
  w: number,
  h: number
): [number, number, number, number] {
  return [x, -(y + h), x + w, -y];
}

/**
 * Converts an OpenLayers extent [minX, minY, maxX, maxY] back to image-space [x, y, w, h].
 * minY = -(y+h), maxY = -y
 */
export function fromOlExtent([minX, minY, maxX, maxY]: number[]): Rect {
  return {
    x: Math.round(minX),
    y: Math.round(-maxY),
    w: Math.round(maxX - minX),
    h: Math.round(maxY - minY),
  };
}

/**
 * The text baseline a rotation angle implies, as an OL line through the box.
 *
 * OCR stores each label as the axis-aligned bounding box of text that may run at
 * any angle, plus a separate `rotation_deg`. For a diagonal label that rectangle
 * is near-square and says nothing about which way the lettering goes. The chord
 * of a *tight* AABB through its centre at the baseline angle is the text's own
 * extent, so the line needs no data beyond the box: the half-length is whichever
 * side the chord reaches first.
 *
 * Returns OL coordinates (y already flipped), or null for a near-horizontal
 * label — where the box itself already reads right — or a degenerate box.
 */
export function baselineChord(
  x: number,
  y: number,
  w: number,
  h: number,
  deg: number | null | undefined,
  minDeg = 5
): [number[], number[]] | null {
  if (deg == null || !Number.isFinite(deg) || !(w > 0) || !(h > 0)) return null;
  // A baseline is a line, not a direction: fold to [-90, 90] so 175° counts as
  // near-horizontal rather than as a steep angle.
  let a = ((deg % 180) + 180) % 180;
  if (a > 90) a -= 180;
  if (Math.abs(a) < minDeg) return null;

  const rad = (a * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const half = Math.min(c < 1e-9 ? Infinity : w / 2 / c, s < 1e-9 ? Infinity : h / 2 / s);
  if (!Number.isFinite(half) || half <= 0) return null;

  const cx = x + w / 2;
  const cy = y + h / 2;
  // OL is y-up, so a positive (counter-clockwise) angle needs no sign flip here —
  // the flip is already in `-cy`.
  const dx = half * Math.cos(rad);
  const dy = half * Math.sin(rad);
  return [
    [cx - dx, -cy - dy],
    [cx + dx, -cy + dy],
  ];
}
