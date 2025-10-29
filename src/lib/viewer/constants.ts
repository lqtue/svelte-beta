import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import { fromLonLat } from 'ol/proj';

export const DATASET_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQivs6N80xA_Pgs0J8MMMTGcH4YLzjhhyxPUoMcoQTxHjUyRXo5FMOICXDSxayDcLYisABkoqvXiIiA/pub?gid=0&single=true&output=csv';

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
  layer: () => TileLayer<XYZ>;
}

export const BASEMAP_DEFS: BasemapDefinition[] = [
  {
    key: 'g-streets',
    label: 'Google Maps',
    layer: () =>
      new TileLayer({
        source: new XYZ({
          urls: [
            'https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
            'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
            'https://mt2.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
            'https://mt3.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'
          ],
          attributions: 'Tiles © Google',
          maxZoom: 22,
          crossOrigin: 'anonymous'
        }),
        visible: true,
        properties: { name: 'g-streets', base: true },
        zIndex: 0
      })
  },
  {
    key: 'g-satellite',
    label: 'Google Satellite',
    layer: () =>
      new TileLayer({
        source: new XYZ({
          urls: [
            'https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            'https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            'https://mt3.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
          ],
          attributions: 'Tiles © Google',
          maxZoom: 22,
          crossOrigin: 'anonymous'
        }),
        visible: false,
        properties: { name: 'g-satellite', base: true },
        zIndex: 0
      })
  }
];
