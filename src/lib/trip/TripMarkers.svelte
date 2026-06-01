<!--
  TripMarkers.svelte — Reveal-as-you-go markers for /trip.

  Only renders points up to `revealedCount` = completed + current. Future
  stops are invisible until completion of the prior stop unveils them.
  A thin "trail" line connects completed → current.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Feature from 'ol/Feature';
  import Point from 'ol/geom/Point';
  import LineString from 'ol/geom/LineString';
  import VectorSource from 'ol/source/Vector';
  import VectorImageLayer from 'ol/layer/VectorImage';
  import Style from 'ol/style/Style';
  import Fill from 'ol/style/Fill';
  import Stroke from 'ol/style/Stroke';
  import CircleStyle from 'ol/style/Circle';
  import Text from 'ol/style/Text';
  import { fromLonLat } from 'ol/proj';
  import type Map from 'ol/Map';

  import type { StoryPoint } from '$lib/story/types';
  import { getShellContext } from '$lib/shell/context';

  export let points: StoryPoint[] = [];
  export let currentIndex = 0;
  export let completedIds: Set<string> = new Set();

  const { map: mapWritable } = getShellContext();

  let olMap: Map | null = null;
  let source: VectorSource | null = null;
  let layer: VectorImageLayer<VectorSource> | null = null;
  let lineSource: VectorSource | null = null;
  let lineLayer: VectorImageLayer<VectorSource> | null = null;

  // Index of the highest revealed point (current). Reveals progress with `currentIndex`.
  $: revealedCount = Math.min(currentIndex + 1, points.length);

  function styleFor(index: number): Style {
    const isDone = completedIds.has(points[index]?.id ?? '');
    const isCurrent = index === currentIndex && !isDone;
    const radius = isCurrent ? 16 : 12;
    const bg = isDone ? '#16a34a' : isCurrent ? '#f59e0b' : '#2563eb';
    return new Style({
      image: new CircleStyle({
        radius,
        fill: new Fill({ color: bg }),
        stroke: new Stroke({ color: '#111', width: 2 })
      }),
      text: new Text({
        text: isDone ? '✓' : String(index + 1),
        font: `800 ${isCurrent ? 13 : 11}px 'Space Grotesk', sans-serif`,
        fill: new Fill({ color: '#fff' })
      }),
      zIndex: isCurrent ? 10 : 1
    });
  }

  function sync() {
    if (!source || !lineSource) return;
    source.clear();
    lineSource.clear();

    const revealed = points.slice(0, revealedCount);
    const coords: number[][] = [];

    for (let i = 0; i < revealed.length; i++) {
      const pt = revealed[i];
      if (!pt.coordinates) continue;
      const c = fromLonLat(pt.coordinates);
      coords.push(c);
      const f = new Feature({ geometry: new Point(c) });
      f.setId(`trip-pt-${i}`);
      f.setStyle(styleFor(i));
      source.addFeature(f);
    }

    if (coords.length >= 2) {
      const line = new Feature({ geometry: new LineString(coords) });
      line.setStyle(
        new Style({
          stroke: new Stroke({
            color: '#2563eb',
            width: 3,
            lineDash: [4, 6],
            lineCap: 'round'
          })
        })
      );
      lineSource.addFeature(line);
    }
  }

  $: if (source && (points || currentIndex || completedIds)) sync();

  onMount(() => {
    const unsub = mapWritable.subscribe(($map) => {
      if (!$map || olMap) return;
      olMap = $map;

      lineSource = new VectorSource();
      lineLayer = new VectorImageLayer({ source: lineSource, zIndex: 28 });
      source = new VectorSource();
      layer = new VectorImageLayer({ source, zIndex: 30 });

      olMap.addLayer(lineLayer);
      olMap.addLayer(layer);
      sync();
    });

    return () => { unsub(); };
  });

  onDestroy(() => {
    if (olMap) {
      if (layer) olMap.removeLayer(layer);
      if (lineLayer) olMap.removeLayer(lineLayer);
    }
  });
</script>
