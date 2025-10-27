<script lang="ts">
  import { onMount } from 'svelte';
  import { env } from '$env/dynamic/public';
  import maplibregl from 'maplibre-gl';
  import type { Map, LngLatBoundsLike } from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { WarpedMapLayer } from '@allmaps/maplibre';
  import { IIIF } from '@allmaps/iiif-parser';
  import { fetchAnnotationsFromApi } from '@allmaps/stdlib';

  type GeoreferencedMap = unknown;

  // Props
  export let mapSource: string | GeoreferencedMap | undefined = undefined;
  export let mapId: string = 'allmaps-map';

  const MAPTILER_STYLE_WITH_KEY = (key: string) =>
    `https://api.maptiler.com/maps/openstreetmap/style.json?key=${key}`;
  const FALLBACK_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

  const maptilerKey = env.PUBLIC_MAPTILER_KEY;
  const mapStyleUrl = maptilerKey ? MAPTILER_STYLE_WITH_KEY(maptilerKey) : FALLBACK_STYLE_URL;
  if (!maptilerKey) {
    console.warn('PUBLIC_MAPTILER_KEY not set; using fallback basemap style.');
  }

  let mapContainer: HTMLElement;
  let map: Map | null = null;
  let warpedMapLayer: WarpedMapLayer | null = null;
  let errorMessage: string | null = null;
  const transparentPixel = () => ({
    width: 1,
    height: 1,
    data: new Uint8Array([0, 0, 0, 0])
  });

  onMount(() => {
    map = new maplibregl.Map({
      container: mapContainer,
      style: mapStyleUrl,
      center: [4.89, 52.37],
      zoom: 10
    });

    map.addControl(new maplibregl.NavigationControl());
    map.addControl(new maplibregl.ScaleControl());
    // Allmaps sometimes requests an empty sprite id; supply a transparent placeholder to silence MapLibre warnings.
    map.on('styleimagemissing', (event) => {
      if (!map || map.hasImage(event.id)) return;
      const imageId = event.id ?? '';
      if (imageId.trim().length === 0) {
        map.addImage(imageId, transparentPixel());
      }
    });

    map.on('load', () => {
      if (mapSource) {
        addOrUpdateLayer(mapSource);
      }
    });

    return () => {
      map?.remove();
      map = null;
    };
  });

  // Function to add or update the WarpedMapLayer
  function isAllmapsId(value: string) {
    return /^[a-f0-9]{16}$/i.test(value);
  }

  function toAllmapsAnnotationUrl(id: string) {
    return `https://annotations.allmaps.org/images/${id}`;
  }

  function isAnnotationsHost(url: URL) {
    return url.hostname.endsWith('annotations.allmaps.org');
  }

  function isAnnotationUrl(url: URL) {
    return isAnnotationsHost(url) && /\/(images|maps|annotations|manifests)\//.test(url.pathname);
  }

  async function addAnnotationObjectsToLayer(
    layer: WarpedMapLayer,
    annotations: unknown[]
  ) {
    const results: Array<string | Error> = [];
    for (const annotation of annotations) {
      const addition = await layer.addGeoreferenceAnnotation(annotation);
      results.push(...addition);
    }
    return results;
  }

  function flattenMapResults(results: Array<string | Error>) {
    const errors = results.filter((result) => result instanceof Error) as Error[];
    if (errors.length) {
      throw new Error(errors.map((err) => err.message).join('; '));
    }
    if (!results.length) {
      throw new Error('Không nhận được bản đồ nào từ annotation đã tải.');
    }
    return results;
  }

  function fitToWarpedMapBounds() {
    if (!map || !warpedMapLayer) return;
    const bounds = warpedMapLayer.getBounds();
    if (bounds) {
      map.fitBounds(bounds as LngLatBoundsLike, { padding: 40 });
    }
  }

  async function addOrUpdateLayer(source: string | GeoreferencedMap) {
    if (!map || !map.isStyleLoaded()) {
      console.warn('Map style not loaded yet.');
      return;
    }

    // Clear previous error
    errorMessage = null;

    try {
      // Remove existing layer if it exists
      if (warpedMapLayer) {
        // Check if the layer exists before removing
        if (map.getLayer(mapId)) {
          map.removeLayer(mapId);
        }
        // Check if the source exists before removing
        if (map.getSource(mapId)) {
          map.removeSource(mapId);
        }
        warpedMapLayer = null;
      }

      // Create and add the new layer
      console.log(`Attempting to add layer ${mapId} with source:`, source);
      warpedMapLayer = new WarpedMapLayer(mapId);
      map.addLayer(warpedMapLayer as unknown as maplibregl.CustomLayerInterface);

      if (!warpedMapLayer) {
        throw new Error('Không thể khởi tạo WarpedMapLayer.');
      }

      if (typeof source !== 'string') {
        const result = await warpedMapLayer.addGeoreferencedMap(source);
        if (result instanceof Error) {
          throw result;
        }
        fitToWarpedMapBounds();
      } else {
        const trimmedSource = source.trim();
        if (!trimmedSource) {
          throw new Error('Không có nguồn bản đồ hợp lệ.');
        }

        let results: Array<string | Error> = [];
        try {
          const url = new URL(trimmedSource);
          if (isAnnotationUrl(url)) {
            results = await warpedMapLayer.addGeoreferenceAnnotationByUrl(url.toString());
          } else {
            const iiifResponse = await fetch(url.toString());
            if (!iiifResponse.ok) {
              throw new Error(`Không thể tải IIIF resource (HTTP ${iiifResponse.status}).`);
            }
            const iiifJson = await iiifResponse.json();
            const parsedIiif = IIIF.parse(iiifJson);
            const annotations = await fetchAnnotationsFromApi(parsedIiif);
            if (!annotations.length) {
              throw new Error('Không tìm thấy Annotation Allmaps nào cho IIIF đã cung cấp.');
            }
            const additionResults = await addAnnotationObjectsToLayer(
              warpedMapLayer,
              annotations
            );
            results = additionResults;
          }
        } catch (error) {
          if (isAllmapsId(trimmedSource)) {
            results = await warpedMapLayer.addGeoreferenceAnnotationByUrl(
              toAllmapsAnnotationUrl(trimmedSource)
            );
          } else {
            throw error;
          }
        }

        flattenMapResults(results);
        fitToWarpedMapBounds();
      }

      console.log(`Layer ${mapId} added/updated.`);

    } catch (error) {
      console.error('Error adding WarpedMapLayer:', error);
      // Set the error message for the user
      errorMessage = `Không thể tải bản đồ: ${
        error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định.'
      }`;

      // Ensure any partially added layer/source is removed on error
      if (map) {
         if (map.getLayer(mapId)) {
           map.removeLayer(mapId);
         }
         if (map.getSource(mapId)) {
           map.removeSource(mapId);
         }
      }
      warpedMapLayer = null; // Reset layer state on error
    }
  }

  // Reactive statement: Watch for changes in mapSource prop
  $: if (mapSource && map && map.isStyleLoaded()) {
    addOrUpdateLayer(mapSource);
  }
</script>

<div class="map-wrapper">
  {#if errorMessage}
    <div class="error-message">
      <p>⚠️ {errorMessage}</p>
      <p>Vui lòng kiểm tra lại URL/ID hoặc thử một bản đồ khác.</p>
    </div>
  {/if}
  <div bind:this={mapContainer} class="map-container" class:has-error={!!errorMessage}></div>
</div>

<style>
  .map-wrapper {
    position: relative;
    width: 100%;
    height: 600px; /* Điều chỉnh chiều cao nếu cần */
  }

  .map-container {
    width: 100%;
    height: 100%;
  }

  /* Làm mờ bản đồ khi có lỗi để thông báo nổi bật hơn */
  .map-container.has-error {
    opacity: 0.3;
    pointer-events: none; /* Ngăn tương tác với bản đồ bị lỗi */
  }

  .error-message {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: rgba(255, 230, 230, 0.95);
    color: #b00020;
    border: 1px solid #b00020;
    padding: 1em 1.5em;
    border-radius: 8px;
    z-index: 10;
    text-align: center;
    max-width: 80%;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  }

  .error-message p {
    margin: 0.5em 0;
  }

  :global(.maplibregl-ctrl-group button) {
    background-color: white;
    border: none;
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
    border-radius: 4px;
    cursor: pointer;
  }
</style>
