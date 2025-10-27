import Feature from 'ol/Feature';
import type { FeatureLike } from 'ol/Feature';
import type { Geometry } from 'ol/geom';
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import CircleStyle from 'ol/style/Circle';
import Text from 'ol/style/Text';

import { DEFAULT_ANNOTATION_COLOR } from './constants';
import type { AnnotationSummary } from './types';

export function randomId(prefix = 'anno') {
  const random = Math.random().toString(36).slice(2, 8);
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function ensureAnnotationDefaults(feature: Feature<Geometry>) {
  let id = feature.getId() as string | undefined;
  if (!id) {
    id = randomId();
    feature.setId(id);
  }
  if (!feature.get('label')) {
    feature.set('label', 'Untitled');
  }
  if (!feature.get('color')) {
    feature.set('color', DEFAULT_ANNOTATION_COLOR);
  }
  if (typeof feature.get('hidden') !== 'boolean') {
    feature.set('hidden', false);
  }
}

export function toAnnotationSummary(feature: Feature<Geometry>): AnnotationSummary {
  ensureAnnotationDefaults(feature);
  return {
    id: feature.getId() as string,
    label: feature.get('label') ?? 'Untitled',
    type: feature.getGeometry()?.getType() ?? 'Geometry',
    color: feature.get('color') ?? DEFAULT_ANNOTATION_COLOR,
    details: feature.get('details') ?? '',
    hidden: Boolean(feature.get('hidden'))
  };
}

export function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  if (![3, 6].includes(normalized.length)) {
    return `rgba(37, 99, 235, ${alpha})`;
  }
  const value = normalized.length === 3 ? normalized.split('').map((ch) => ch + ch).join('') : normalized;
  const bigint = Number.parseInt(value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function createAnnotationStyle(featureLike: FeatureLike): Style | undefined {
  const feature = featureLike as Feature<Geometry>;
  ensureAnnotationDefaults(feature);
  if (feature.get('hidden')) return undefined;
  const color = feature.get('color') ?? DEFAULT_ANNOTATION_COLOR;
  const geometryType = feature.getGeometry()?.getType() ?? 'Geometry';
  const textLabel = feature.get('label');
  const text =
    textLabel && textLabel.trim().length
      ? new Text({
          text: textLabel,
          font: '600 13px "Inter", system-ui, sans-serif',
          fill: new Fill({ color: '#111827' }),
          padding: [3, 6, 2, 6],
          backgroundFill: new Fill({ color: 'rgba(255,255,255,0.85)' }),
          overflow: true,
          offsetY: geometryType === 'Point' ? -18 : 0
        })
      : undefined;

  if (geometryType === 'Point') {
    return new Style({
      image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color: '#ffffff' }),
        stroke: new Stroke({ color, width: 3 })
      }),
      text
    });
  }

  return new Style({
    stroke: new Stroke({ color, width: 3 }),
    fill: new Fill({ color: hexToRgba(color, 0.15) }),
    text
  });
}

export const searchResultStyle = new Style({
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: '#06b6d4' }),
    stroke: new Stroke({ color: '#0e7490', width: 2 })
  }),
  stroke: new Stroke({ color: '#06b6d4', width: 2 }),
  fill: new Fill({ color: 'rgba(6, 182, 212, 0.18)' })
});
