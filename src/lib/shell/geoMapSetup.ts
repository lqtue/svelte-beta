/**
 * geoMapSetup.ts — shared helpers for /view, /create, /annotate mode components.
 *
 * These three modes each instantiate the same mapStore + layerStore and define
 * three identical handlers. This module centralises them so mode components
 * become focused on their unique behavior.
 */
import { createMapStore } from '$lib/stores/mapStore';
import { createLayerStore } from '$lib/stores/layerStore';
import type { ViewMode } from '$lib/map/types';

export function createGeoMapStores() {
  return {
    mapStore: createMapStore(),
    layerStore: createLayerStore(),
  };
}

export function toggleBasemap(
  layerStore: ReturnType<typeof createLayerStore>,
  current: string,
): void {
  layerStore.setBasemap(current === 'g-streets' ? 'g-satellite' : 'g-streets');
}

export function onChangeViewMode(
  layerStore: ReturnType<typeof createLayerStore>,
  event: CustomEvent<{ mode: ViewMode }>,
): void {
  layerStore.setViewMode(event.detail.mode);
}

export function onChangeOpacity(
  layerStore: ReturnType<typeof createLayerStore>,
  event: CustomEvent<{ value: number }>,
): void {
  layerStore.setOverlayOpacity(event.detail.value);
}
