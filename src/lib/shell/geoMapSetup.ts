/**
 * geoMapSetup.ts — the store pair every geo-map mode (/view, /create, /annotate,
 * /studio, /explore, /trip) instantiates.
 */
import { createMapStore } from '$lib/stores/mapStore';
import { createLayerStore } from '$lib/stores/layerStore';

export function createGeoMapStores() {
  return {
    mapStore: createMapStore(),
    layerStore: createLayerStore(),
  };
}
