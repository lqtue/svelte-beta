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
 * A label's own rectangle — the object the OCR review tools edit.
 *
 * `cx`/`cy` is the centre in image space (y-down), `w` runs along the text and
 * `h` across it, and `deg` is the text direction, counter-clockwise on screen.
 * Everything the editor does is one of these turning, moving or resizing; the
 * axis-aligned `global_*` box in the database is derived from it (`obbAabb`),
 * never the other way round.
 */
export interface Obb {
  cx: number;
  cy: number;
  w: number;
  h: number;
  deg: number;
}

export type ObbCorner = 'nw' | 'ne' | 'sw' | 'se';

/** Corner order is fixed, so callers can zip it against `OBB_CORNERS`. */
export const OBB_CORNERS: ObbCorner[] = ['nw', 'ne', 'se', 'sw'];

/** Unit signs of each corner in the label's own frame: [along, across]. */
const CORNER_SIGNS: Record<ObbCorner, [number, number]> = {
  nw: [-1, -1],
  ne: [1, -1],
  se: [1, 1],
  sw: [-1, 1],
};

/** The label frame's unit axes in image space: along the text, and across it. */
function obbAxes(deg: number): { ux: number; uy: number; vx: number; vy: number } {
  const rad = (deg * Math.PI) / 180;
  // Image space is y-down and a positive angle reads counter-clockwise on
  // screen, so the text runs along (cos, -sin) and its normal is (sin, cos).
  return {
    ux: Math.cos(rad),
    uy: -Math.sin(rad),
    vx: Math.sin(rad),
    vy: Math.cos(rad),
  };
}

/** One corner of the label, in image space. */
export function obbCorner(obb: Obb, corner: ObbCorner): [number, number] {
  const { ux, uy, vx, vy } = obbAxes(obb.deg);
  const [su, sv] = CORNER_SIGNS[corner];
  return [
    obb.cx + (su * obb.w * ux) / 2 + (sv * obb.h * vx) / 2,
    obb.cy + (su * obb.w * uy) / 2 + (sv * obb.h * vy) / 2,
  ];
}

/** The four corners in `OBB_CORNERS` order, image space. */
export function obbCorners(obb: Obb): [number, number][] {
  return OBB_CORNERS.map((c) => obbCorner(obb, c));
}

/** The label as an OL ring (y flipped, first point repeated). */
export function obbRing(obb: Obb): number[][] {
  const ring = obbCorners(obb).map(([x, y]) => [x, -y]);
  return [...ring, ring[0]];
}

/** The axis-aligned box that exactly contains the label — what the DB stores. */
export function obbAabb(obb: Obb): Rect {
  const rad = (obb.deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const w = obb.w * c + obb.h * s;
  const h = obb.w * s + obb.h * c;
  return { x: obb.cx - w / 2, y: obb.cy - h / 2, w, h };
}

/** Centre of an OL ring, back in image space. Four corners, so the mean will do. */
export function ringCentre(ring: readonly (readonly number[])[]): [number, number] {
  const pts = ring.slice(0, 4);
  const n = pts.length || 1;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of pts) {
    sx += x;
    sy += -y;
  }
  return [sx / n, sy / n];
}

/**
 * Resize by dragging one corner: the opposite corner stays put and the label
 * grows along its *own* axes, so a diagonal street label stretches lengthwise
 * instead of being pulled square. Dragging past the anchor flips the box rather
 * than collapsing it.
 */
export function obbFromCornerDrag(
  obb: Obb,
  corner: ObbCorner,
  point: readonly number[],
  min = 2
): Obb {
  const { ux, uy, vx, vy } = obbAxes(obb.deg);
  const [su, sv] = CORNER_SIGNS[corner];
  // The anchor is the corner diagonally opposite the one being dragged.
  const ax = obb.cx - (su * obb.w * ux) / 2 - (sv * obb.h * vx) / 2;
  const ay = obb.cy - (su * obb.w * uy) / 2 - (sv * obb.h * vy) / 2;
  const dx = point[0] - ax;
  const dy = point[1] - ay;
  const du = dx * ux + dy * uy;
  const dv = dx * vx + dy * vy;
  const w = Math.max(min, Math.abs(du));
  const h = Math.max(min, Math.abs(dv));
  const sw = (du < 0 ? -1 : 1) * (w / 2);
  const sh = (dv < 0 ? -1 : 1) * (h / 2);
  return {
    cx: ax + sw * ux + sh * vx,
    cy: ay + sw * uy + sh * vy,
    w,
    h,
    deg: obb.deg,
  };
}

/**
 * The size of the label an axis-aligned box implies at a given angle — the
 * reader for rows that have no `label_w`/`label_h` yet.
 *
 * The AABB of a `along` x `across` rectangle turned by an angle is exactly
 *     w = along|cos| + across|sin|
 *     h = along|sin| + across|cos|
 * so both come back by inverting that 2x2 system. Null when the inversion cannot
 * be trusted: within a couple of degrees of 45 the two equations are the same one
 * (a square box says nothing about which side is the lettering), or the solve
 * comes out non-positive, meaning the stored angle and box disagree.
 *
 * This is why `label_w`/`label_h` exist (migration 076): a *derived* size cannot
 * be edited — turning the label would resize it.
 */
export function labelStripSize(
  w: number,
  h: number,
  deg: number | null | undefined
): { along: number; across: number } | null {
  if (deg == null || !Number.isFinite(deg) || !(w > 0) || !(h > 0)) return null;
  const rad = (foldAngle(deg) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const det = c * c - s * s;
  if (Math.abs(det) < 0.06) return null;
  const along = (w * c - h * s) / det;
  const across = (h * c - w * s) / det;
  if (!(along > 1) || !(across > -1)) return null;
  // A one-line label solves to a couple of pixels across; keep it drawable.
  return { along, across: Math.max(2, across) };
}

/** The columns an `Obb` is stored in. */
export type ObbRow = {
  global_x: number;
  global_y: number;
  global_w: number;
  global_h: number;
  rotation_deg?: number | null;
  label_w?: number | null;
  label_h?: number | null;
};

/**
 * The label rectangle a stored row means.
 *
 * `label_w`/`label_h` are the truth when present. Otherwise the size is derived
 * from the box and the angle — which is all the OCR pipeline writes — and if even
 * that fails the box itself stands in, turned to the stored angle. The first edit
 * of such a row writes the columns and it never guesses again.
 */
export function obbFromRow(row: ObbRow): Obb {
  const cx = row.global_x + row.global_w / 2;
  const cy = row.global_y + row.global_h / 2;
  const deg = foldAngle(
    Number.isFinite(row.rotation_deg as number) ? (row.rotation_deg as number) : 0
  );
  if ((row.label_w ?? 0) > 0 && (row.label_h ?? 0) > 0) {
    return { cx, cy, w: row.label_w as number, h: row.label_h as number, deg };
  }
  const size = labelStripSize(row.global_w, row.global_h, deg);
  return { cx, cy, w: size?.along ?? row.global_w, h: size?.across ?? row.global_h, deg };
}

/** The columns to write for a label rectangle: itself, plus the box around it. */
export function obbToRow(obb: Obb): Required<ObbRow> {
  const aabb = obbAabb(obb);
  return {
    global_x: aabb.x,
    global_y: aabb.y,
    global_w: aabb.w,
    global_h: aabb.h,
    rotation_deg: Math.round(foldAngle(obb.deg) * 10) / 10,
    label_w: obb.w,
    label_h: obb.h,
  };
}

/**
 * Folds any angle to (-90, 90]. A text baseline is a line, not a direction:
 * 175 deg is a near-horizontal label, not a steep one, and a rotation handle
 * dragged past vertical must not flip the label end over end.
 */
export function foldAngle(deg: number): number {
  const a = ((deg % 180) + 180) % 180; // [0, 180)
  return a > 90 ? a - 180 : a;
}

/**
 * The label angle a pointer implies while the rotation handle is dragged.
 * The box centre is image-space (y-down); `olPoint` is where the pointer is in
 * OL space (y-up). Returns degrees in the same folded range the renderer reads.
 */
export function rotationFromPointer(cx: number, cy: number, olPoint: readonly number[]): number {
  const dx = olPoint[0] - cx;
  const dy = olPoint[1] + cy; // OL y is -image y, so centre sits at -cy
  if (dx === 0 && dy === 0) return 0;
  return foldAngle((Math.atan2(dy, dx) * 180) / Math.PI);
}

/**
 * Where the rotation handle sits: out past the end of the label, along its own
 * direction. The pad scales with the label rather than the zoom — a fixed pixel
 * gap would need the view resolution and would slide under the pointer while
 * zooming. Returns an OL coordinate.
 */
export function rotationHandlePoint(obb: Obb): number[] {
  const { ux, uy } = obbAxes(obb.deg);
  const reach = obb.w / 2 + Math.max(6, Math.max(obb.w, obb.h) * 0.12);
  return [obb.cx + reach * ux, -(obb.cy + reach * uy)];
}
