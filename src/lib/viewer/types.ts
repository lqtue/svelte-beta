import type { FeatureCollection, GeoJsonObject } from 'geojson';

export type ViewMode = 'overlay' | 'side-x' | 'side-y' | 'spy';
export type DrawingMode = 'point' | 'line' | 'polygon';

export interface MapListItem {
  id: string;
  name: string;
  type: string;
  summary?: string;
  description?: string;
  thumbnail?: string;
  isFeatured?: boolean;
  year?: number;
  bounds?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
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

export interface StoryScene {
  id: string;
  title: string;
  details: string;
  delay: number;
  center: [number, number];
  zoom: number;
  rotation: number;
  basemap: string;
  overlayId: string | null;
  opacity: number;
  viewMode: ViewMode;
  sideRatio: number;
  lensRadius: number;
  visibleAnnotations: string[];
  hidden: boolean;
}

export interface PersistedAppState {
  basemapSelection?: string;
  selectedMapId?: string;
  overlayId?: string;
  mapView?: PersistedViewState;
  view?: PersistedViewSettings;
  annotations?: FeatureCollection;
  storyScenes?: StoryScene[];
}
