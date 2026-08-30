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
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import Translate from 'ol/interaction/Translate';
import type OlMap from 'ol/Map';
import type { StyleLike } from 'ol/style/Style';
import type { Rect } from './rectUtils';
import { olPointToImage } from './rectUtils';

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
  h: number
): Feature[] {
  const corners: [HandleRole, number, number][] = [
    ['nw', x, y],
    ['ne', x + w, y],
    ['sw', x, y + h],
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
  h: number
): void {
  const pos: Record<HandleRole, [number, number]> = {
    nw: [x, y],
    ne: [x + w, y],
    sw: [x, y + h],
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
  h: number
): [number, number] {
  switch (role) {
    case 'nw':
      return [x + w, y + h]; // se
    case 'ne':
      return [x, y + h]; // sw
    case 'sw':
      return [x + w, y]; // ne
    case 'se':
      return [x, y]; // nw
  }
}

/**
 * Given the dragged corner's new IMAGE-SPACE position and the fixed opposite
 * corner's IMAGE-SPACE position, returns the new rect. Enforces minimum 1px size.
 */
export function rectFromHandleMove(
  _role: HandleRole,
  newPos: [number, number],
  oppositePos: [number, number]
): Rect {
  const x = Math.round(Math.min(newPos[0], oppositePos[0]));
  const y = Math.round(Math.min(newPos[1], oppositePos[1]));
  const w = Math.max(1, Math.round(Math.abs(newPos[0] - oppositePos[0])));
  const h = Math.max(1, Math.round(Math.abs(newPos[1] - oppositePos[1])));
  return { x, y, w, h };
}

/**
 * Corner-handle rectangle editor.
 *
 * Owns the handle VectorSource/VectorLayer plus the Translate interaction, and
 * turns a corner drag into a new image-space rect:
 *   translateend → olPointToImage → oppositeCorner → rectFromHandleMove
 *                → clamp? → updateHandlePositions → onChange
 *
 * Callers keep ownership of the rect itself: `getRect(bboxId)` supplies the
 * pre-drag rect, `onChange(bboxId, rect)` receives the post-drag one.
 */
export interface RectEditor {
  layer: VectorLayer;
  /** Show handles for `bboxId` at `rect`; pass null to hide them. */
  show(bboxId: string | null, rect: Rect | null): void;
  /** Reposition existing handles (e.g. after the body was translated). */
  move(rect: Rect): void;
  setActive(active: boolean): void;
  destroy(): void;
}

export function createRectEditor(
  map: OlMap,
  opts: {
    getRect: (bboxId: string) => Rect | null;
    onChange: (bboxId: string, rect: Rect) => void;
    clamp?: (rect: Rect) => Rect;
    onDragStart?: (bboxId: string) => void;
    zIndex?: number;
    style?: StyleLike;
  }
): RectEditor {
  const source = new VectorSource();
  const layer = new VectorLayer({ source, zIndex: opts.zIndex ?? 9, style: opts.style });
  map.addLayer(layer);

  const translate = new Translate({ layers: [layer] });
  translate.on('translatestart', (e: any) => {
    const feat = e.features.getArray()[0];
    if (feat && opts.onDragStart) opts.onDragStart(feat.get('bboxId') as string);
  });
  translate.on('translateend', (e: any) => {
    const feat = e.features.getArray()[0];
    if (!feat) return;
    const bboxId = feat.get('bboxId') as string;
    const role = feat.get('handleRole') as HandleRole;
    const current = opts.getRect(bboxId);
    if (!current) return;
    const newPos = olPointToImage((feat.getGeometry() as Point).getCoordinates());
    const oppPos = oppositeCorner(role, current.x, current.y, current.w, current.h);
    const raw = rectFromHandleMove(role, newPos, oppPos);
    const rect = opts.clamp ? opts.clamp(raw) : raw;
    updateHandlePositions(source.getFeatures(), rect.x, rect.y, rect.w, rect.h);
    opts.onChange(bboxId, rect);
  });
  map.addInteraction(translate);

  return {
    layer,
    show(bboxId, rect) {
      if (!bboxId || !rect) {
        source.clear();
        return;
      }
      const existing = source.getFeatures();
      if (existing.length === 4 && existing[0].get('bboxId') === bboxId) {
        updateHandlePositions(existing, rect.x, rect.y, rect.w, rect.h);
        return;
      }
      source.clear();
      source.addFeatures(createHandleFeatures(bboxId, rect.x, rect.y, rect.w, rect.h));
    },
    move(rect) {
      updateHandlePositions(source.getFeatures(), rect.x, rect.y, rect.w, rect.h);
    },
    setActive(active) {
      translate.setActive(active);
    },
    destroy() {
      map.removeInteraction(translate);
      map.removeLayer(layer);
    },
  };
}
