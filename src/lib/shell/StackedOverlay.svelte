<!--
  StackedOverlay.svelte — extra warped overlay layer added to the primary OL Map.

  Unlike HistoricalOverlay (which is tied to mapStore.activeMapId), this component
  takes an explicit `allmapsId` prop and renders an INDEPENDENT WarpedMapLayer.
  Used by compare-stack mode to stack multiple historical maps on the same view.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { WarpedMapLayer } from '@allmaps/openlayers';
  import type Map from 'ol/Map';
  import { getShellContext } from './context';
  import { createWarpedLayer, destroyWarpedLayer, loadOverlayByUrl, setOverlayOpacity } from './warpedOverlay';

  /** Allmaps service credential — hex ID or full annotation URL. */
  export let allmapsId: string = '';
  export let opacity: number = 0.6;
  export let visible: boolean = true;

  const { map: mapWritable } = getShellContext();

  let layer: WarpedMapLayer | null = null;
  let olMap: Map | null = null;
  let currentId: string | null = null;

  $: if (layer && olMap) {
    setOverlayOpacity(layer, olMap, opacity);
  }

  $: if (layer) {
    const canvas = layer.getCanvas();
    if (canvas) canvas.style.display = visible ? '' : 'none';
  }

  $: if (layer && olMap && allmapsId && allmapsId !== currentId) {
    currentId = allmapsId;
    loadOverlayByUrl(layer, olMap, allmapsId, opacity).catch((e) => {
      console.warn('[StackedOverlay] Load failed:', e);
    });
  }

  onMount(() => {
    const unsub = mapWritable.subscribe(($m) => {
      if (!$m || layer) return;
      olMap = $m;
      layer = createWarpedLayer($m);
      if (allmapsId) {
        currentId = allmapsId;
        loadOverlayByUrl(layer, $m, allmapsId, opacity).catch((e) => {
          console.warn('[StackedOverlay] Initial load failed:', e);
        });
      }
    });
    return unsub;
  });

  onDestroy(() => {
    if (layer) {
      destroyWarpedLayer(layer);
      layer = null;
    }
  });
</script>
