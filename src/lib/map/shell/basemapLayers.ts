/**
 * The basemap tile layers every OL map mounts — one instance per map, since
 * an OL layer belongs to a single map. Shared by MapShell and DualMapPane.
 *
 * Visibility is NOT set here: `LayerRenderer` owns it, driven by
 * `layersStore.base` (DualMapPane toggles its own copies directly).
 */
import type BaseLayer from 'ol/layer/Base';
import { BASEMAP_DEFS } from '$lib/map/constants';

export function createBasemapLayers(): Map<string, BaseLayer> {
  const layers = new Map<string, BaseLayer>();
  for (const def of BASEMAP_DEFS) {
    layers.set(def.key, def.layer() as unknown as BaseLayer);
  }
  return layers;
}
