import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import VectorTileLayer from 'ol/layer/VectorTile';
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
import { applyStyle } from 'ol-mapbox-style';
import { layers as pmLayers, namedFlavor } from '@protomaps/basemaps';
import { PUBLIC_PROTOMAPS_KEY } from '$env/static/public';

export const DEFAULT_ANNOTATION_COLOR = '#2563eb';
export const APP_STATE_KEY = 'vma-viewer-state-v1';

export const DRAW_TYPE_MAP = {
  point: 'Point',
  line: 'LineString',
  polygon: 'Polygon'
} as const;

export const INITIAL_CENTER = fromLonLat([106.70098, 10.77653]);

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
        name: 'Quần đảo Hoàng Sa\n(Việt Nam)'
      }),
      new Feature({
        geometry: new Point(fromLonLat([114.0, 9.5])),
        name: 'Quần đảo Trường Sa\n(Việt Nam)'
      })
    ]
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
          overflow: true
        })
      })
  });
}

function buildProtomapsGroup(visible: boolean): LayerGroup {
  const tileLayer = new VectorTileLayer({
    declutter: true,
    zIndex: 0
  });
  const style = {
    version: 8 as const,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/light',
    sources: {
      protomaps: {
        type: 'vector' as const,
        tiles: [
          `https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=${PUBLIC_PROTOMAPS_KEY}`
        ],
        attribution:
          '<a href="https://protomaps.com" target="_blank">Protomaps</a> &copy; <a href="https://openstreetmap.org" target="_blank">OpenStreetMap</a>'
      }
    },
    layers: pmLayers('protomaps', namedFlavor('light'), { lang: 'vi' })
  };
  applyStyle(tileLayer, style as any, 'protomaps').catch((err) => {
    console.error('[basemap] Failed to apply Protomaps style', err);
  });

  return new LayerGroup({
    visible,
    properties: { name: 'g-streets', base: true },
    zIndex: 0,
    layers: [tileLayer, buildVnClaimsLayer()]
  });
}

export const BASEMAP_DEFS: BasemapDefinition[] = [
  {
    key: 'g-streets',
    label: 'Protomaps (Tiếng Việt)',
    layer: () => buildProtomapsGroup(true)
  },
  {
    key: 'g-satellite',
    label: 'Esri Satellite',
    layer: () =>
      new TileLayer({
        source: new XYZ({
          urls: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          ],
          attributions:
            'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
          maxZoom: 19,
          crossOrigin: 'anonymous'
        }),
        visible: false,
        properties: { name: 'g-satellite', base: true },
        zIndex: 0
      })
  }
];
