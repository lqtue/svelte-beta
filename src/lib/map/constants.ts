import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import LayerGroup from 'ol/layer/Group';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import Style from 'ol/style/Style';
import Text from 'ol/style/Text';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import type BaseLayer from 'ol/layer/Base';

export const DEFAULT_ANNOTATION_COLOR = '#2563eb';

export const DRAW_TYPE_MAP = {
  point: 'Point',
  line: 'LineString',
  polygon: 'Polygon',
} as const;

export interface BasemapDefinition {
  key: string;
  label: string;
  layer: () => BaseLayer;
}

function buildVnClaimsLayer(): VectorLayer<VectorSource> {
  const source = new VectorSource({
    features: [
      new Feature({
        geometry: new Point(fromLonLat([112.0, 16.5])),
        name: 'Quần đảo Hoàng Sa\n(Việt Nam)',
      }),
      new Feature({
        geometry: new Point(fromLonLat([114.0, 9.5])),
        name: 'Quần đảo Trường Sa\n(Việt Nam)',
      }),
    ],
  });
  return new VectorLayer({
    source,
    zIndex: 10,
    declutter: false,
    style: (feature) =>
      new Style({
        text: new Text({
          text: feature.get('name'),
          font: '600 13px "Inter", system-ui, -apple-system, sans-serif',
          fill: new Fill({ color: '#b91c1c' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 }),
          textAlign: 'center',
          textBaseline: 'middle',
          overflow: true,
        }),
      }),
  });
}

function buildStreetsGroup(visible: boolean): LayerGroup {
  const tileLayer = new TileLayer({
    // CARTO's keyless raster endpoint now stamps "API KEY REQUIRED" across every
    // tile, so this is the OSM Foundation's own standard style: keyless, and the
    // attribution we already showed. Their tile usage policy fits an archive of
    // this size but not a heavy one — the upgrade path is a Protomaps key
    // (`PUBLIC_PROTOMAPS_KEY` is already in .env.example) or a paid CARTO plan.
    source: new XYZ({
      urls: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attributions: [
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      ],
      maxZoom: 19,
      crossOrigin: 'anonymous',
    }),
    zIndex: 0,
  });

  return new LayerGroup({
    visible,
    properties: { name: 'g-streets', base: true },
    zIndex: 0,
    layers: [tileLayer, buildVnClaimsLayer()],
  });
}

export const BASEMAP_DEFS: BasemapDefinition[] = [
  {
    key: 'g-streets',
    label: 'Streets',
    layer: () => buildStreetsGroup(true),
  },
  {
    key: 'g-satellite',
    label: 'Esri Satellite',
    layer: () =>
      new TileLayer({
        source: new XYZ({
          urls: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          attributions:
            'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
          maxZoom: 19,
          crossOrigin: 'anonymous',
        }),
        visible: false,
        properties: { name: 'g-satellite', base: true },
        zIndex: 0,
      }),
  },
  {
    key: 'g-custom',
    label: 'Custom URL',
    layer: () =>
      new TileLayer({
        // Source is assigned dynamically by MapShell from layerStore.customBaseUrl.
        visible: false,
        properties: { name: 'g-custom', base: true },
        zIndex: 0,
      }),
  },
];
