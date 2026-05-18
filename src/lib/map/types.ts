import type { FeatureCollection, GeoJsonObject } from 'geojson';

// Canonical map types live in $lib/maps/. This module re-exports MapListItem
// for the many UI-side consumers and adds UI-only types (ViewMode, etc).
export type { MapListItem } from '$lib/maps/types';

export type ViewMode = 'overlay' | 'spy' | 'dual';
export type DrawingMode = 'point' | 'line' | 'polygon';

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

export interface AnnotationSet {
  id: string;
  title: string;
  mapId: string;
  authorId: string;
  features: FeatureCollection;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}
