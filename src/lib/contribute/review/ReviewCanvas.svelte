<!--
  ReviewCanvas.svelte — IIIF pixel-space viewer displaying needs_review SAM polygons.
  Orange stroke = unreviewed; yellow stroke + zoom = selected.
  Emits 'select' when user clicks a polygon.
-->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import OlMap from 'ol/Map';
  import View from 'ol/View';
  import TileLayer from 'ol/layer/Tile';
  import IIIF from 'ol/source/IIIF';
  import IIIFInfo from 'ol/format/IIIFInfo';
  import VectorLayer from 'ol/layer/Vector';
  import VectorSource from 'ol/source/Vector';
  import Feature from 'ol/Feature';
  import Polygon from 'ol/geom/Polygon';
  import Style from 'ol/style/Style';
  import Fill from 'ol/style/Fill';
  import Stroke from 'ol/style/Stroke';
  import Circle from 'ol/style/Circle';
  import Modify from 'ol/interaction/Modify';
  import Collection from 'ol/Collection';
  import { Zoom } from 'ol/control';
  import { defaults as defaultControls } from 'ol/control/defaults';
  import 'ol/ol.css';

  import type { SamFootprint } from '$lib/supabase/labels';

  const dispatch = createEventDispatcher<{
    select: { id: string };
    edit: { id: string; pixelPolygon: [number, number][] };
    ready: void;
    error: { message: string };
  }>();

  export let iiifInfoUrl: string | null = null;
  export let footprints: SamFootprint[] = [];
  export let selectedId: string | null = null;

  let mapContainer: HTMLDivElement;
  let map: OlMap | null = null;
  let fpSource: VectorSource | null = null;
  let tileLayer: TileLayer | null = null;
  let modifyInteraction: Modify | null = null;
  let modifyCollection: Collection<Feature> = new Collection();
  let loadingImage = false;
  let loadError = '';

  // Styles
  const styleDefault = new Style({
    stroke: new Stroke({ color: '#f97316', width: 1.5 }),
    fill:   new Fill({ color: 'rgba(249,115,22,0.12)' }),
  });

  const styleSelected = new Style({
    stroke: new Stroke({ color: '#eab308', width: 2.5 }),
    fill:   new Fill({ color: 'rgba(234,179,8,0.22)' }),
  });

  function getStyle(feature: any): Style {
    return feature.getId() === selectedId ? styleSelected : styleDefault;
  }

  function syncFootprints() {
    if (!fpSource) return;
    fpSource.clear();
    for (const fp of footprints) {
      const ring = fp.pixelPolygon.map(([x, y]) => [x, -y]);
      const feature = new Feature({ geometry: new Polygon([ring]) });
      feature.setId(fp.id);
      fpSource.addFeature(feature);
    }
  }

  // Zoom to selected polygon's extent
  function focusSelected(id: string | null) {
    if (!map || !fpSource || !id) return;
    const feature = fpSource.getFeatureById(id);
    if (!feature) return;
    const geom = feature.getGeometry();
    if (!geom) return;
    map.getView().fit(geom.getExtent(), {
      padding: [80, 80, 80, 80],
      duration: 350,
      maxZoom: 6,
    });
  }

  $: if (fpSource) { syncFootprints(); fpSource.changed(); }
  $: focusSelected(selectedId);
  $: syncModifyTarget(selectedId);

  // Keep the Modify collection in sync with the selected feature
  function syncModifyTarget(id: string | null) {
    modifyCollection.clear();
    if (!fpSource || !id) return;
    const feature = fpSource.getFeatureById(id);
    if (feature) modifyCollection.push(feature);
  }

  $: if (iiifInfoUrl && map) loadIIIFImage(iiifInfoUrl);

  async function loadIIIFImage(infoUrl: string) {
    if (!map) return;
    loadingImage = true;
    loadError = '';
    try {
      const res = await fetch(infoUrl);
      if (!res.ok) throw new Error(`IIIF info fetch failed: ${res.status}`);
      const info = await res.json();
      const options = new IIIFInfo(info).getTileSourceOptions();
      if (!options) throw new Error('Could not parse IIIF tile source options');
      if (tileLayer) map.removeLayer(tileLayer);
      const iiifSource = new IIIF(options);
      tileLayer = new TileLayer({ source: iiifSource, zIndex: 0 });
      map.getLayers().insertAt(0, tileLayer);
      const tileGrid = iiifSource.getTileGrid();
      if (tileGrid) {
        map.getView().fit(tileGrid.getExtent(), { padding: [40, 40, 40, 40], duration: 300 });
      }
    } catch (err: any) {
      loadError = err.message || 'Failed to load image';
      dispatch('error', { message: loadError });
    } finally {
      loadingImage = false;
    }
  }

  onMount(() => {
    fpSource = new VectorSource();
    const fpLayer = new VectorLayer({ source: fpSource, zIndex: 5, style: getStyle });

    map = new OlMap({
      target: mapContainer,
      layers: [fpLayer],
      view: new View({ center: [0, 0], zoom: 1, showFullExtent: true }),
      controls: defaultControls({ attribution: false, rotate: false, zoom: false })
        .extend([new Zoom()]),
    });

    // Modify interaction — only edits the selected polygon
    modifyInteraction = new Modify({
      features: modifyCollection,
      style: new Style({
        image: new Circle({
          radius: 5,
          fill: new Fill({ color: '#22c55e' }),
          stroke: new Stroke({ color: '#fff', width: 1.5 }),
        }),
      }),
    });
    map.addInteraction(modifyInteraction);

    modifyInteraction.on('modifyend', (event) => {
      event.features.forEach((f: Feature) => {
        const id = String(f.getId());
        const geom = f.getGeometry() as Polygon;
        if (!geom) return;
        // Convert from OL coords [x, -y] back to IIIF pixel space [x, y]
        const ring = geom.getCoordinates()[0].map(([x, y]) => [x, -y] as [number, number]);
        dispatch('edit', { id, pixelPolygon: ring });
      });
    });

    map.on('click', (e) => {
      if (!fpSource) return;
      const hit = map!.forEachFeatureAtPixel(e.pixel, (f) => f);
      if (hit) dispatch('select', { id: String(hit.getId()) });
    });

    dispatch('ready');
    syncFootprints();
    if (iiifInfoUrl) loadIIIFImage(iiifInfoUrl);
  });

  onDestroy(() => {
    if (map && modifyInteraction) map.removeInteraction(modifyInteraction);
    map?.setTarget(undefined);
    map = null;
  });
</script>

<div class="canvas-wrap">
  <div bind:this={mapContainer} class="canvas-map"></div>

  {#if loadingImage}
    <div class="overlay"><div class="spinner"></div><span>Loading IIIF image…</span></div>
  {:else if loadError}
    <div class="overlay error"><span>⚠ {loadError}</span></div>
  {:else if !iiifInfoUrl}
    <div class="overlay"><span class="empty-msg">Select a map to begin</span></div>
  {/if}

  <div class="legend">
    <span class="dot orange"></span> Needs review
    <span class="dot yellow" style="margin-left:0.75rem"></span> Selected
    <span class="dot green" style="margin-left:0.75rem"></span> Drag to edit
  </div>
</div>

<style>
  .canvas-wrap {
    position: relative;
    flex: 1;
    background: #111;
  }

  .canvas-map { width: 100%; height: 100%; }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    background: rgba(17,17,17,0.75);
    z-index: 20;
    font-family: "Be Vietnam Pro", sans-serif;
    color: #d1c9be;
  }

  .overlay.error { color: #fca5a5; }

  .empty-msg { font-size: 0.9rem; color: #6b7280; }

  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid #2d2a26;
    border-top-color: #f97316;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .legend {
    position: absolute;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: rgba(26,22,18,0.85);
    border: 1px solid #2d2a26;
    border-radius: 6px;
    padding: 0.3rem 0.75rem;
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.75rem;
    color: #9ca3af;
    pointer-events: none;
    z-index: 10;
  }

  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .dot.orange { background: #f97316; }
  .dot.yellow { background: #eab308; }
  .dot.green  { background: #22c55e; }
</style>
