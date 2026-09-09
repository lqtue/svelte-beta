/**
 * The basemap tile layers every OL map mounts — one instance per map, since
 * an OL layer belongs to a single map. Shared by MapShell and DualMapPane.
 *
 * Visibility is NOT set at construction: `LayerRenderer` owns it for /explore,
 * driven by `layersStore.base` (DualMapPane toggles its own copies directly),
 * and `HeroMap` — which deliberately mounts no LayerRenderer, so as not to
 * touch the persisted store — calls `setVisibleBasemap` once for itself.
 */
import type BaseLayer from 'ol/layer/Base';
import type OlMap from 'ol/Map';
import { BASEMAP_DEFS } from '$lib/map/constants';

export function createBasemapLayers(): Map<string, BaseLayer> {
  const layers = new Map<string, BaseLayer>();
  for (const def of BASEMAP_DEFS) {
    layers.set(def.key, def.layer() as unknown as BaseLayer);
  }
  return layers;
}

/** Show only the basemap matching `key`; `'none'` or an unknown key hides them all. */
export function setVisibleBasemap(map: OlMap, key: string): void {
  map.getLayers().forEach((layer) => {
    const props = layer.getProperties() as { base?: boolean; name?: string };
    if (props?.base) layer.setVisible((props.name ?? '') === key);
  });
}
