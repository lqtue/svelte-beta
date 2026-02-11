<!--
  StoryMarkers.svelte — Draws numbered point markers on the map for story playback.
  Headless component: creates an OL vector layer with styled point features.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Feature from 'ol/Feature';
  import Point from 'ol/geom/Point';
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

  const { map: mapWritable } = getShellContext();

  let olMap: Map | null = null;
  let source: VectorSource | null = null;
  let layer: VectorImageLayer<VectorSource> | null = null;

  function createStyle(index: number, isCurrent: boolean): Style {
    const radius = isCurrent ? 16 : 12;
    const bgColor = isCurrent ? '#d4af37' : 'rgba(244, 232, 216, 0.95)';
    const textColor = isCurrent ? '#fff' : '#4a3f35';
    const borderColor = isCurrent ? '#b8942f' : '#d4af37';
    const borderWidth = isCurrent ? 3 : 2;

    return new Style({
      image: new CircleStyle({
        radius,
        fill: new Fill({ color: bgColor }),
        stroke: new Stroke({ color: borderColor, width: borderWidth })
      }),
      text: new Text({
        text: String(index + 1),
        font: `bold ${isCurrent ? 13 : 11}px 'Be Vietnam Pro', sans-serif`,
        fill: new Fill({ color: textColor }),
        offsetY: 0
      }),
      zIndex: isCurrent ? 10 : 1
    });
  }

  function syncFeatures() {
    if (!source) return;
    source.clear();

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (!pt.coordinates) continue;
      const coord = fromLonLat(pt.coordinates);
      const feature = new Feature({ geometry: new Point(coord) });
      feature.setId(`story-pt-${i}`);
      feature.setStyle(createStyle(i, i === currentIndex));
      source.addFeature(feature);
    }
  }

  $: if (source && points) syncFeatures();
  $: if (source) {
    // Update styles when currentIndex changes
    source.getFeatures().forEach((f) => {
      const id = f.getId() as string;
      if (!id?.startsWith('story-pt-')) return;
      const i = parseInt(id.replace('story-pt-', ''), 10);
      f.setStyle(createStyle(i, i === currentIndex));
    });
  }

  onMount(() => {
    const unsub = mapWritable.subscribe(($map) => {
      if (!$map || olMap) return;
      olMap = $map;

      source = new VectorSource();
      layer = new VectorImageLayer({
        source,
        zIndex: 30
      });

      olMap.addLayer(layer);
      syncFeatures();
    });

    return () => { unsub(); };
  });

  onDestroy(() => {
    if (olMap && layer) {
      olMap.removeLayer(layer);
    }
  });
</script>
