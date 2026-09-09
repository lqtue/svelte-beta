<!--
  UserLocationLayer.svelte — the dot for where the reader is.

  Headless, like FocusPulse beside it: mounts one OL point layer on the shell
  map and draws a single marker at the last GPS fix. `GpsTracker` moved the
  camera to the first fix and fed `coverage.matchAt`, but nothing painted the
  position, so "My location" left the reader at a spot with no mark on it.

  Static on purpose — a pulsing dot beside FocusPulse's ring would read as two
  animations arguing. A halo, an ink core and a paper rim, which is what makes
  it legible over both a warped sheet and satellite imagery.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Feature from 'ol/Feature';
  import Point from 'ol/geom/Point';
  import VectorSource from 'ol/source/Vector';
  import VectorLayer from 'ol/layer/Vector';
  import Style from 'ol/style/Style';
  import Stroke from 'ol/style/Stroke';
  import Fill from 'ol/style/Fill';
  import CircleStyle from 'ol/style/Circle';
  import { fromLonLat } from 'ol/proj';
  import type Map from 'ol/Map';

  import { getShellContext } from '$lib/map/shell/context';
  import { INK, inkAlpha } from '$lib/core/ink';

  /** [lon, lat] of the last fix, or null for no fix / GPS off. */
  export let point: [number, number] | null = null;

  const { map: mapWritable } = getShellContext();

  const STYLE = [
    new Style({
      image: new CircleStyle({ radius: 13, fill: new Fill({ color: inkAlpha(INK.blue, 0.18) }) }),
    }),
    new Style({
      image: new CircleStyle({
        radius: 5.5,
        fill: new Fill({ color: INK.blue }),
        stroke: new Stroke({ color: INK.paper, width: 2 }),
      }),
    }),
  ];

  let olMap: Map | null = null;
  let source: VectorSource | null = null;
  let layer: VectorLayer<VectorSource> | null = null;

  onMount(() => {
    const unsub = mapWritable.subscribe((m) => {
      if (!m || olMap) return;
      olMap = m;
      source = new VectorSource();
      // Under FocusPulse's 60: a ring aimed at a place the reader asked for
      // should not be hidden behind the dot for where they happen to stand.
      layer = new VectorLayer({ source, style: STYLE, zIndex: 55 });
      m.addLayer(layer);
    });
    return unsub;
  });

  onDestroy(() => {
    if (olMap && layer) olMap.removeLayer(layer);
  });

  $: if (source) {
    source.clear();
    if (point) source.addFeature(new Feature(new Point(fromLonLat(point))));
  }
</script>
