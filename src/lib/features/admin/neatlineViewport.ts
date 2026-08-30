/**
 * Zoom / pan maths for NeatlineEditor's hand-rolled `<img>` viewport.
 *
 * Pure functions so the component keeps only the pointer plumbing. The editor
 * works on a single downscaled JPEG (not IIIF tiles), so it does not use
 * ImageShell/OpenLayers — see the note in NeatlineEditor.svelte.
 */

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 12;

/**
 * At zoom = 1 the canvas fits the viewport exactly → pan must be 0,0.
 * Zoomed in, the canvas is larger; pan may go negative only as far as keeping
 * the far edge of the canvas inside the viewport.
 */
export function clampPan(
  v: Viewport,
  vpW: number,
  vpH: number,
  contentW: number,
  contentH: number
): Viewport {
  return {
    zoom: v.zoom,
    panX: Math.max(Math.min(vpW - contentW * v.zoom, 0), Math.min(0, v.panX)),
    panY: Math.max(Math.min(vpH - contentH * v.zoom, 0), Math.min(0, v.panY)),
  };
}

/**
 * Scales by `factor` around the viewport-space point (cx, cy), keeping whatever
 * is under the cursor stationary:
 *   cx = panX + ix * zoom      →  ix = (cx - panX) / zoom
 *   cx = panX' + ix * zoom'    →  panX' = cx - ix * zoom'
 */
export function zoomAt(
  v: Viewport,
  cx: number,
  cy: number,
  factor: number,
  vpW: number,
  vpH: number,
  contentW: number,
  contentH: number
): Viewport {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
  return clampPan(
    {
      zoom,
      panX: cx - ((cx - v.panX) / v.zoom) * zoom,
      panY: cy - ((cy - v.panY) / v.zoom) * zoom,
    },
    vpW,
    vpH,
    contentW,
    contentH
  );
}

/** Rescales a point between the native image and its laid-out display size. */
export function rescale(
  x: number,
  y: number,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number
): [number, number] {
  if (!fromW || !fromH || !toW || !toH) return [x, y];
  return [(x / fromW) * toW, (y / fromH) * toH];
}
