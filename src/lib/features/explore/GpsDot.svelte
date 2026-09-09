<!--
  GpsDot.svelte — where the reader is, on the map.

  Headless, the same shape as FocusPulse: one OL point layer on the shell map,
  no markup. `GpsTracker` emitted fixes and `ExplorePage` moved the camera to
  the first one and worked out which sheets covered it, but nothing drew the
  spot — so "My location" moved the view and left no answer to *where am I*.

  Static, not animated: it is a position, not an event. FocusPulse is the one
  that pulses, and it sits above this at zIndex 60.
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

  /** `[lng, lat]`, or null when GPS is off or has no fix yet. */
  export let position: [number, number] | null = null;

  const { map: mapWritable } = getShellContext();

  let olMap: Map | null = null;
  let source: VectorSource | null = null;
  let layer: VectorLayer<VectorSource> | null = null;

  /* A halo under a hard dot: the halo carries at a glance over red 1882 ink,
     and the paper-coloured ring keeps the dot's edge off the sheet's own. */
  const STYLE = [
    new Style({
      image: new CircleStyle({
        radius: 13,
        fill: new Fill({ color: inkAlpha(INK.blue, 0.18) }),
      }),
    }),
    new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: INK.blue }),
        stroke: new Stroke({ color: INK.paper, width: 2.5 }),
      }),
    }),
  ];

  onMount(() =>
    mapWritable.subscribe((m) => {
      if (!m || olMap) return;
      olMap = m;
      source = new VectorSource();
      layer = new VectorLayer({ source, style: STYLE, zIndex: 55 });
      m.addLayer(layer);
    })
  );

  onDestroy(() => {
    if (olMap && layer) olMap.removeLayer(layer);
  });

  $: if (source) {
    source.clear();
    if (position) source.addFeature(new Feature(new Point(fromLonLat(position))));
  }
</script>
