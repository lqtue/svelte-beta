/**
 * Shared WarpedMapLayer lifecycle utilities.
 *
 * Extracted from StudioMap + TripTracker so every mode
 * (shell, annotate, trip, lab) uses the same proven code.
 */

import { WarpedMapLayer } from '@allmaps/openlayers';
import { annotationUrlForSource } from '$lib/core/iiif/annotationUrl';
import type Map from 'ol/Map';

// ── Create / destroy ─────────────────────────────────────────────

/**
 * Creates a WarpedMapLayer with the required OL polyfills
 * and attaches it to the map via setMap().
 */
export function createWarpedLayer(
  map: Map,
  opts: { zIndex?: number; name?: string } = {}
): WarpedMapLayer {
  const layer = new WarpedMapLayer();
  layer.setZIndex(opts.zIndex ?? 10);
  layer.setProperties({ name: opts.name ?? 'allmaps-overlay' });

  // Polyfills required by some OL versions
  const compat = layer as unknown as {
    getDeclutter?: () => boolean;
    renderDeferred?: (...args: unknown[]) => boolean;
  };
  if (!compat.getDeclutter) compat.getDeclutter = () => false;
  if (!compat.renderDeferred) compat.renderDeferred = () => false;

  // Must use setMap(), not the layers array
  const cast = layer as unknown as { setMap?: (m: unknown) => void };
  cast.setMap?.(map as unknown);

  clearBeforeEachFrame(layer);

  return layer;
}

/**
 * Wipe the WebGL canvas before every frame the layer draws.
 *
 * @allmaps/render's WebGL2Renderer.render() does not clear: the only
 * gl.clear(COLOR_BUFFER_BIT) it owns sits in clear(), a teardown path that also
 * empties the tile cache. Per frame it relies on the implicit clear a browser
 * performs when it composites a canvas whose context was created with
 * preserveDrawingBuffer false (WarpedMapLayer.ts does not pass the flag, so it
 * is false). When the compositor coalesces or skips that step — its choice, not
 * ours, which is why this reproduces on one profile and not another on the same
 * GPU — the previous frames survive and each new one draws over them. Panning
 * ghosts along the drag; zooming leaves a scaled fan of copies.
 *
 * #renderInternal redraws every map in the viewport each frame, so an explicit
 * clear first can never leave a gap. Where the browser was already clearing,
 * this is a no-op.
 *
 * ponytail: monkey-patch over a fork. It is six lines against an upstream beta
 * that may well fix this; drop it when @allmaps/render clears for itself.
 */
function clearBeforeEachFrame(layer: WarpedMapLayer): void {
  const host = layer as unknown as {
    render: (frameState: unknown) => unknown;
    renderer?: { gl?: WebGL2RenderingContext };
  };
  const inner = host.render.bind(layer);
  host.render = (frameState: unknown) => {
    const gl = host.renderer?.gl;
    if (gl) {
      gl.clearColor(0, 0, 0, 0); // transparent, so the basemap still shows through
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
    return inner(frameState);
  };
}

/**
 * Detaches a WarpedMapLayer from the map.
 */
export function destroyWarpedLayer(layer: WarpedMapLayer): void {
  const cast = layer as unknown as { setMap?: (m: unknown) => void };
  cast.setMap?.(null);
}

// ── Load overlay ─────────────────────────────────────────────────

// Re-exported from its new home in $lib/core/iiif so existing importers keep working.
export { annotationUrlForSource } from '$lib/core/iiif/annotationUrl';

/**
 * Loads an overlay into a WarpedMapLayer using `addGeoreferenceAnnotationByUrl`.
 *
 * Same approach as TripTracker. The WarpedMapLayer handles fetching + parsing.
 * Calls `map.render()` after load to force a repaint (critical).
 */
export async function loadOverlayByUrl(
  layer: WarpedMapLayer,
  map: Map,
  source: string,
  opacity = 0.8
): Promise<void> {
  // Clear any previous overlay
  layer.clear();

  const url = annotationUrlForSource(source);
  await layer.addGeoreferenceAnnotationByUrl(url);

  // Apply opacity directly on the layer (same as TripTracker)
  (layer as any).setOpacity(opacity);

  // Force repaint — without this the tiles won't appear
  map.render();
}

// ── Opacity ──────────────────────────────────────────────────────

/**
 * Sets opacity directly on the WarpedMapLayer.
 * Uses layer.setOpacity() which is the approach that works in TripTracker.
 */
export function setOverlayOpacity(layer: WarpedMapLayer, map: Map, opacity: number): void {
  (layer as any).setOpacity(opacity);
  map.render();
}

export function clearOverlay(layer: WarpedMapLayer, map?: Map): void {
  layer.clear();
  map?.render();
}

// ── View mode clip mask ──────────────────────────────────────────

export type ViewModeClip = 'overlay' | 'spy' | 'dual';

/**
 * Applies a CSS clip-path on the WarpedMapLayer canvas to implement
 * side-by-side and spy-glass comparison modes.
 *
 * This is the exact same logic from StudioMap.updateClipMask().
 */
export function applyClipMask(
  layer: WarpedMapLayer,
  map: Map,
  mode: ViewModeClip,
  lensRadius: number
): void {
  const canvas = layer.canvas;
  if (!canvas) return;

  const size = map.getSize();
  if (!size) return;
  const [w, h] = size;

  switch (mode) {
    case 'spy': {
      canvas.style.clipPath = `circle(${lensRadius}px at ${w / 2}px ${h / 2}px)`;
      break;
    }
    default:
      canvas.style.clipPath = '';
  }
}
