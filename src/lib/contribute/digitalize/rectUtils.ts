/**
 * rectUtils.ts — Shared utilities for handling rectangular bounding boxes
 * in image-pixel space with OpenLayers.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Converts image-space [x, y, w, h] to an OpenLayers LinearRing (array of points).
 * Accounting for OL y-flipping (image_y = -ol_y).
 */
export function toOlRing(x: number, y: number, w: number, h: number): number[][] {
  return [
    [x,     -y],
    [x + w, -y],
    [x + w, -(y + h)],
    [x,     -(y + h)],
    [x,     -y],
  ];
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

