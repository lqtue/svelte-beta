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
