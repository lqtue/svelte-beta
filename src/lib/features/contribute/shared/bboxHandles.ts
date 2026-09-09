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
import type { Obb, ObbCorner, Rect } from '$lib/core/geo/rectUtils';
import { OBB_CORNERS, obbCorner, obbFromCornerDrag, olPointToImage } from '$lib/core/geo/rectUtils';

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
    /** Live, every pointer move: the rect the drag would land on right now. */
    onDrag?: (bboxId: string, rect: Rect) => void;
    clamp?: (rect: Rect) => Rect;
    onDragStart?: (bboxId: string) => void;
    zIndex?: number;
    style?: StyleLike;
  }
): RectEditor {
  const source = new VectorSource();
  const layer = new VectorLayer({ source, zIndex: opts.zIndex ?? 9, style: opts.style });
  map.addLayer(layer);

  /** The rect the dragged handle implies right now; the anchor is the stored
   *  opposite corner, which is why `getRect` may not be updated mid-drag. */
  function draggedRect(feat: Feature): { bboxId: string; rect: Rect } | null {
    const bboxId = feat.get('bboxId') as string;
    const role = feat.get('handleRole') as HandleRole;
    const current = opts.getRect(bboxId);
    if (!current) return null;
    const newPos = olPointToImage((feat.getGeometry() as Point).getCoordinates());
    const oppPos = oppositeCorner(role, current.x, current.y, current.w, current.h);
    const raw = rectFromHandleMove(role, newPos, oppPos);
    return { bboxId, rect: opts.clamp ? opts.clamp(raw) : raw };
  }

  // Slightly more slack than the body drag, so a corner still wins next to it.
  const translate = new Translate({ layers: [layer], hitTolerance: 8 });
  translate.on('translatestart', (e: any) => {
    const feat = e.features.getArray()[0];
    if (feat && opts.onDragStart) opts.onDragStart(feat.get('bboxId') as string);
  });
  // Live preview. The three corners that are *not* under the pointer are
  // carried along with the box; the dragged one is left to OL, because writing
  // its position from underneath fights the drag.
  translate.on('translating', (e: any) => {
    const feat = e.features.getArray()[0];
    const next = feat && draggedRect(feat);
    if (!next) return;
    const { x, y, w, h } = next.rect;
    updateHandlePositions(
      source.getFeatures().filter((f) => f !== feat),
      x,
      y,
      w,
      h
    );
    if (opts.onDrag) opts.onDrag(next.bboxId, next.rect);
  });
  translate.on('translateend', (e: any) => {
    const feat = e.features.getArray()[0];
    const next = feat && draggedRect(feat);
    if (!next) return;
    const { bboxId, rect } = next;
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

/**
 * One draggable handle that turns a box.
 *
 * Same shape as `createRectEditor` — its own layer plus a Translate — but the
 * caller gets raw OL coordinates rather than a rect, because what a rotation
 * drag means is `rotationFromPointer(centre, coord)` and the centre belongs to
 * the caller. Add it to the map *after* the corner editor so that where the two
 * overlap the rotation wins (OL dispatches interactions last-added-first).
 */
export interface RotateHandle {
  layer: VectorLayer;
  /** Show the handle for `bboxId` at an OL point; null hides it. */
  show(bboxId: string | null, olPoint: number[] | null): void;
  setActive(active: boolean): void;
  destroy(): void;
}

export function createRotateHandle(
  map: OlMap,
  opts: {
    /** Live, every pointer move. */
    onDrag: (bboxId: string, olPoint: number[]) => void;
    /** On drop. */
    onChange: (bboxId: string, olPoint: number[]) => void;
    onDragStart?: (bboxId: string) => void;
    zIndex?: number;
    style?: StyleLike;
  }
): RotateHandle {
  const source = new VectorSource();
  const layer = new VectorLayer({ source, zIndex: opts.zIndex ?? 10, style: opts.style });
  map.addLayer(layer);

  const coordOf = (feat: Feature) => (feat.getGeometry() as Point).getCoordinates();

  const translate = new Translate({ layers: [layer], hitTolerance: 10 });
  translate.on('translatestart', (e: any) => {
    const feat = e.features.getArray()[0];
    if (feat && opts.onDragStart) opts.onDragStart(feat.get('bboxId') as string);
  });
  translate.on('translating', (e: any) => {
    const feat = e.features.getArray()[0];
    if (feat) opts.onDrag(feat.get('bboxId') as string, coordOf(feat));
  });
  translate.on('translateend', (e: any) => {
    const feat = e.features.getArray()[0];
    if (feat) opts.onChange(feat.get('bboxId') as string, coordOf(feat));
  });
  map.addInteraction(translate);

  return {
    layer,
    show(bboxId, olPoint) {
      if (!bboxId || !olPoint) {
        source.clear();
        return;
      }
      const existing = source.getFeatures()[0];
      if (existing && existing.get('bboxId') === bboxId) {
        (existing.getGeometry() as Point).setCoordinates(olPoint);
        return;
      }
      source.clear();
      const feat = new Feature({ geometry: new Point(olPoint) });
      feat.setId(`${bboxId}:rotate`);
      feat.set('bboxId', bboxId);
      source.addFeature(feat);
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

/**
 * Corner editor for a label rectangle that is *not* axis-aligned.
 *
 * Same skeleton as `createRectEditor` — four Point features on their own layer
 * plus a Translate — but the handles sit on the turned corners and a drag is
 * resolved in the label's own frame, so a diagonal label stretches lengthwise
 * rather than being pulled square. The caller owns the rectangle: `getObb`
 * supplies the one the drag started from, `onDrag`/`onChange` receive the new one.
 */
export interface ObbEditor {
  layer: VectorLayer;
  /** Show handles for `bboxId` on `obb`; null hides them. */
  show(bboxId: string | null, obb: Obb | null): void;
  /** Reposition existing handles (after a body move, say). */
  move(obb: Obb): void;
  setActive(active: boolean): void;
  destroy(): void;
}

export function createObbEditor(
  map: OlMap,
  opts: {
    /** The rectangle as stored — the drag anchor, so it must not change mid-drag. */
    getObb: (bboxId: string) => Obb | null;
    onChange: (bboxId: string, obb: Obb) => void;
    /** Live, every pointer move. */
    onDrag?: (bboxId: string, obb: Obb) => void;
    onDragStart?: (bboxId: string) => void;
    zIndex?: number;
    style?: StyleLike;
  }
): ObbEditor {
  const source = new VectorSource();
  const layer = new VectorLayer({ source, zIndex: opts.zIndex ?? 9, style: opts.style });
  map.addLayer(layer);

  /** `except` is the handle under the pointer, which OL is already moving. */
  function place(bboxId: string, obb: Obb, except?: Feature) {
    const existing = source.getFeatures();
    if (existing.length === 4 && existing[0].get('bboxId') === bboxId) {
      for (const feat of existing) {
        if (feat === except) continue;
        const [x, y] = obbCorner(obb, feat.get('obbCorner') as ObbCorner);
        (feat.getGeometry() as Point).setCoordinates([x, -y]);
      }
      return;
    }
    source.clear();
    source.addFeatures(
      OBB_CORNERS.map((corner) => {
        const [x, y] = obbCorner(obb, corner);
        const feat = new Feature({ geometry: new Point([x, -y]) });
        feat.setId(`${bboxId}:${corner}`);
        feat.set('obbCorner', corner);
        feat.set('bboxId', bboxId);
        return feat;
      })
    );
  }

  /** The rectangle the dragged handle implies right now. */
  function dragged(feat: Feature): { bboxId: string; obb: Obb } | null {
    const bboxId = feat.get('bboxId') as string;
    const current = opts.getObb(bboxId);
    if (!current) return null;
    const point = olPointToImage((feat.getGeometry() as Point).getCoordinates());
    return { bboxId, obb: obbFromCornerDrag(current, feat.get('obbCorner') as ObbCorner, point) };
  }

  const translate = new Translate({ layers: [layer], hitTolerance: 8 });
  translate.on('translatestart', (e: any) => {
    const feat = e.features.getArray()[0];
    if (feat && opts.onDragStart) opts.onDragStart(feat.get('bboxId') as string);
  });
  // Live preview. The three corners that are not under the pointer follow the
  // rectangle; the dragged one is left to OL, or the write fights the drag.
  translate.on('translating', (e: any) => {
    const feat = e.features.getArray()[0];
    const next = feat && dragged(feat);
    if (!next) return;
    place(next.bboxId, next.obb, feat);
    if (opts.onDrag) opts.onDrag(next.bboxId, next.obb);
  });
  translate.on('translateend', (e: any) => {
    const feat = e.features.getArray()[0];
    const next = feat && dragged(feat);
    if (!next) return;
    place(next.bboxId, next.obb);
    opts.onChange(next.bboxId, next.obb);
  });
  map.addInteraction(translate);

  return {
    layer,
    show(bboxId, obb) {
      if (!bboxId || !obb) {
        source.clear();
        return;
      }
      place(bboxId, obb);
    },
    move(obb) {
      const bboxId = source.getFeatures()[0]?.get('bboxId') as string | undefined;
      if (bboxId) place(bboxId, obb);
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
