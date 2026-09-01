/**
 * The self-hosted vector basemap.
 *
 * One ~37 MB PMTiles archive of the Saigon region (Protomaps' daily OpenStreetMap
 * build, bbox 106.3,10.3 → 107.1,11.2, z0–15) living in our own R2 bucket and
 * served by `worker/` at `iiif.maparchive.vn/basemap/`. No API key, no quota, no
 * third-party usage policy — the same independence the map imagery already has.
 *
 * Rebuild when OSM has moved on enough to matter:
 *
 *   pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles saigon.pmtiles \
 *     --bbox=106.3,10.3,107.1,11.2
 *   rclone copyto saigon.pmtiles r2:vma-tiles/basemap/saigon.pmtiles --s3-no-check-bucket
 *
 * Builds are retained for about a week, so take the date from a recent one.
 *
 * The styling is deliberately quiet. This is the backdrop a georeferenced
 * historical map is laid over, so it reads as reference, not as content: muted
 * land, restrained water, roads that thin out at low zoom, and labels only where
 * they help you place yourself. Protomaps v4 schema layers are `earth`,
 * `landcover`, `landuse`, `water`, `roads`, `buildings`, `boundaries`, `places`
 * and `pois`; anything not handled below renders nothing on purpose.
 */

import VectorTileLayer from 'ol/layer/VectorTile';
import { PMTilesVectorSource } from 'ol-pmtiles';
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Text from 'ol/style/Text';
import type { FeatureLike } from 'ol/Feature';

export const BASEMAP_PMTILES_URL = 'https://iiif.maparchive.vn/basemap/saigon.pmtiles';

const C = {
  earth: '#f4f1ea',
  landcover: '#e9eee2',
  park: '#e2ebdd',
  water: '#cddfe8',
  waterLine: '#b9d2df',
  building: '#e6e1d6',
  boundary: '#b8b2a6',
  roadFill: '#ffffff',
  roadCasing: '#e0d9cb',
  highway: '#f6e6c8',
  highwayCasing: '#dcc79b',
  label: '#5b554a',
  labelHalo: '#f8f6f1',
  waterLabel: '#7796a5',
} as const;

/** Cheap singletons — a style function runs per feature per frame. */
const S = {
  earth: new Style({ fill: new Fill({ color: C.earth }) }),
  landcover: new Style({ fill: new Fill({ color: C.landcover }) }),
  park: new Style({ fill: new Fill({ color: C.park }) }),
  water: new Style({ fill: new Fill({ color: C.water }) }),
  building: new Style({ fill: new Fill({ color: C.building }) }),
  boundary: new Style({
    stroke: new Stroke({ color: C.boundary, width: 1, lineDash: [4, 3] }),
  }),
};

const PARK_KINDS = new Set(['park', 'garden', 'forest', 'nature_reserve', 'recreation_ground']);

/** Road casing + fill widths, in screen px, by road class and zoom. */
function roadWidth(kind: string, zoom: number): number {
  if (kind === 'highway') return zoom < 9 ? 0.8 : zoom < 12 ? 1.6 : zoom < 14 ? 3 : 5;
  if (kind === 'major_road') return zoom < 10 ? 0 : zoom < 12 ? 1 : zoom < 14 ? 2.2 : 4;
  if (kind === 'medium_road') return zoom < 12 ? 0 : zoom < 14 ? 1.2 : 2.6;
  if (kind === 'minor_road') return zoom < 14 ? 0 : 1.4;
  return 0;
}

function waterLineWidth(zoom: number): number {
  return zoom < 9 ? 0.5 : zoom < 12 ? 1 : zoom < 14 ? 1.8 : 3;
}

/**
 * Vietnamese administrative sub-units — `Khu phố 13`, `Ấp 4`, `Tổ 7` — are
 * numbered blocks, not places anyone navigates by. OSM has one per few streets,
 * so rendering them buries Saigon under a grid of numerals. Named
 * neighbourhoods (Tân Định, Đa Kao, Ba Son) are exactly what you *do* want.
 */
// Matches the prefix *and* its number, so a real name like "Ấp Bắc" survives.
// No `\b` here: JavaScript word boundaries are ASCII-only, and "khu phố" ends
// in `ố`, so `\b` never matches after it.
const ADMIN_BLOCK = /^(khu phố|khu vực|ấp|tổ|thôn|xóm)\s+\d/iu;

/** Place labels appear as you zoom in, biggest settlements first. */
function placeLabel(
  kind: string,
  zoom: number,
  name: string
): { size: number; weight: number } | null {
  if (kind === 'locality' || kind === 'city') {
    if (zoom < 6) return null;
    return { size: zoom < 10 ? 12 : 14, weight: 600 };
  }
  if (kind === 'town') return zoom < 10 ? null : { size: 12, weight: 500 };
  if (kind === 'village') return zoom < 12 ? null : { size: 11, weight: 500 };
  if (kind === 'neighbourhood' || kind === 'suburb') {
    if (zoom < 14 || ADMIN_BLOCK.test(name)) return null;
    return { size: 11, weight: 400 };
  }
  return null;
}

function label(text: string, size: number, weight: number, color: string, italic = false): Style {
  return new Style({
    text: new Text({
      text,
      font: `${italic ? 'italic ' : ''}${weight} ${size}px "Inter", system-ui, sans-serif`,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: C.labelHalo, width: 3 }),
      overflow: false,
    }),
  });
}

/**
 * Name in the local script, falling back to the romanised name. Vietnamese IS
 * the local script here, so `name` is already what we want; `name:en` only wins
 * when a feature has no local name at all.
 */
function nameOf(f: FeatureLike): string | null {
  return (f.get('name') as string) || (f.get('name:en') as string) || null;
}

function styleFor(feature: FeatureLike, resolution: number): Style | Style[] | undefined {
  // OL gives resolution, the schema thinks in zoom. 156543 m/px is z0 at the equator.
  const zoom = Math.log2(156543.03392 / resolution);
  const layer = feature.get('layer') as string;
  const kind = (feature.get('kind') as string) ?? '';

  switch (layer) {
    case 'earth':
      return S.earth;

    case 'landcover':
      return zoom < 8 ? undefined : S.landcover;

    case 'landuse':
      return PARK_KINDS.has(kind) ? S.park : undefined;

    case 'water': {
      if (feature.getGeometry()?.getType() === 'LineString') {
        const w = waterLineWidth(zoom);
        return new Style({ stroke: new Stroke({ color: C.waterLine, width: w }) });
      }
      if (zoom >= 12) {
        const name = nameOf(feature);
        if (name && (kind === 'river' || kind === 'lake' || kind === 'canal')) {
          return [S.water, label(name, 11, 400, C.waterLabel, true)];
        }
      }
      return S.water;
    }

    case 'buildings':
      return zoom < 15 ? undefined : S.building;

    case 'boundaries':
      // Only the national line; admin subdivisions add noise at this scale.
      return kind === 'country' ? S.boundary : undefined;

    case 'roads': {
      const w = roadWidth(kind, zoom);
      if (w === 0) return undefined;
      const isHighway = kind === 'highway';
      return [
        new Style({
          stroke: new Stroke({
            color: isHighway ? C.highwayCasing : C.roadCasing,
            width: w + 1.4,
          }),
        }),
        new Style({
          stroke: new Stroke({ color: isHighway ? C.highway : C.roadFill, width: w }),
        }),
      ];
    }

    case 'places': {
      const name = nameOf(feature);
      if (!name) return undefined;
      const spec = placeLabel(kind, zoom, name);
      return spec ? label(name, spec.size, spec.weight, C.label) : undefined;
    }

    default:
      return undefined;
  }
}

/** The basemap layer. `visible` is owned by the caller, as with every base layer. */
export function buildPmtilesBasemapLayer(visible: boolean): VectorTileLayer {
  return new VectorTileLayer({
    // Labels must not collide; polygons and lines are drawn in schema order.
    declutter: true,
    source: new PMTilesVectorSource({
      url: BASEMAP_PMTILES_URL,
      attributions: [
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
        '<a href="https://protomaps.com" target="_blank">Protomaps</a>',
      ],
    }),
    style: styleFor,
    visible,
    zIndex: 0,
  });
}
