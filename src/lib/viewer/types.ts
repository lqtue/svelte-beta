import type { FeatureCollection, GeoJsonObject } from 'geojson';

export type ViewMode = 'overlay' | 'side-x' | 'side-y' | 'spy';
export type TabKey = 'map' | 'annotations';
export type DrawingMode = 'point' | 'line' | 'polygon';

export interface MapListItem {
  id: string;
  name: string;
  type: string;
}

export interface AnnotationSummary {
  id: string;
  label: string;
  type: string;
  color: string;
  details?: string;
  hidden: boolean;
}

export interface SearchResult {
  display_name: string;
  lon: string;
  lat: string;
  type?: string;
  geojson?: GeoJsonObject;
}

export interface PersistedViewState {
  center: [number, number];
  zoom: number;
  rotation: number;
}

export interface PersistedViewSettings {
  mode: ViewMode;
  sideRatio: number;
  lensRadius: number;
  opacity: number;
}

export interface PersistedAppState {
  basemapSelection?: string;
  selectedMapId?: string;
  overlayId?: string;
  mapView?: PersistedViewState;
  view?: PersistedViewSettings;
  annotations?: FeatureCollection;
}
