/**
 * bboxHandles.ts — Corner handle features for rectangle editing in OL.
 *
 * Instead of using OL Modify (which infers which corner moved after the fact),
 * we create 4 dedicated Point features — one per corner. Each stores its role
 * so OL Translate on those features tells us exactly which corner is being dragged.
 *
 * Coordinate conventions:
 *   - All x/y/w/h values are IMAGE-SPACE (y-down, pixels from top-left).
 *   - OL uses y-flipped space (ol_y = -image_y). The y-flip is applied internally
 *     here so callers always work in image-space.
 */

import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import type { Rect } from '../digitalize/rectUtils';

export type HandleRole = 'nw' | 'ne' | 'sw' | 'se';

/**
 * Returns 4 corner Point features for `bboxId` at the given image-space rect.
 * Each feature has:
 *   - id:            `${bboxId}:${role}`
 *   - 'handleRole':  HandleRole
 *   - 'bboxId':      string
 */
export function createHandleFeatures(
  bboxId: string,
  x: number,
  y: number,
  w: number,
  h: number,
): Feature[] {
  const corners: [HandleRole, number, number][] = [
    ['nw', x,     y],
    ['ne', x + w, y],
    ['sw', x,     y + h],
    ['se', x + w, y + h],
  ];
  return corners.map(([role, cx, cy]) => {
    const feat = new Feature({ geometry: new Point([cx, -cy]) });
    feat.setId(`${bboxId}:${role}`);
    feat.set('handleRole', role);
    feat.set('bboxId', bboxId);
    return feat;
  });
}

/**
 * Updates existing handle feature positions (in-place) to match a new rect.
 * Avoids re-creating features (keeps OL selection state stable).
 */
export function updateHandlePositions(
  features: Feature[],
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const pos: Record<HandleRole, [number, number]> = {
    nw: [x,     y],
    ne: [x + w, y],
    sw: [x,     y + h],
    se: [x + w, y + h],
  };
  for (const feat of features) {
    const role = feat.get('handleRole') as HandleRole;
    const [cx, cy] = pos[role];
    (feat.getGeometry() as Point).setCoordinates([cx, -cy]);
  }
}

/**
 * Returns the image-space position of the corner OPPOSITE to `role`.
 * This is the anchor point that stays fixed while the dragged corner moves.
 */
export function oppositeCorner(
  role: HandleRole,
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number] {
  switch (role) {
    case 'nw': return [x + w, y + h]; // se
    case 'ne': return [x,     y + h]; // sw
    case 'sw': return [x + w, y    ]; // ne
    case 'se': return [x,     y    ]; // nw
  }
}

/**
 * Given the dragged corner's new IMAGE-SPACE position and the fixed opposite
 * corner's IMAGE-SPACE position, returns the new rect. Enforces minimum 1px size.
 */
export function rectFromHandleMove(
  _role: HandleRole,
  newPos: [number, number],
  oppositePos: [number, number],
): Rect {
  const x = Math.round(Math.min(newPos[0], oppositePos[0]));
  const y = Math.round(Math.min(newPos[1], oppositePos[1]));
  const w = Math.max(1, Math.round(Math.abs(newPos[0] - oppositePos[0])));
  const h = Math.max(1, Math.round(Math.abs(newPos[1] - oppositePos[1])));
  return { x, y, w, h };
}

/**
 * Converts an OL Point coordinate [ol_x, ol_y] back to image-space [img_x, img_y].
 * OL convention: ol_y = -img_y, so img_y = -ol_y.
 */
export function olPointToImage(olCoord: number[]): [number, number] {
  return [olCoord[0], -olCoord[1]];
}
