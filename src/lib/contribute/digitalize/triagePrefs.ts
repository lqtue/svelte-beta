/**
 * triagePrefs.ts — per-map localStorage for the /contribute/digitalize page.
 *
 * Two independent records, both keyed by map id:
 *   digitalize-triage-<mapId>  neatline + tile grid + per-tile overrides
 *   digitalize-seg-<mapId>     MapSAM2 command configuration
 *
 * Keys and stored shapes are deliberately unchanged from the inline version so
 * existing per-map state survives this refactor. (They predate the `vma-*-v1`
 * convention; renaming them is a separate migration.) `runId` and
 * `minConfidence` are per-run choices and stay out of storage, as before.
 */

import { readJson, writeJson } from '$lib/utils/persistence/storage';
import type { TileOverrides } from './tileParams';
import { DEFAULT_SEG_CONFIG, type SegConfig } from './segCommand';

/** Everything the Triage phase edits, shared between its sidebar and the canvas. */
export type TriageState = {
  neatline: [number, number, number, number] | null;
  tileSize: number;
  overlap: number;
  runId: string;
  minConfidence: number;
  tileOverrides: TileOverrides;
};

export function defaultTriageState(): TriageState {
  return {
    neatline: null,
    tileSize: 2400,
    overlap: 300,
    runId: '',
    minConfidence: 0.5,
    tileOverrides: {},
  };
}

/** The on-disk shape — snake_case, matching what the OCR API takes. */
type StoredTriage = {
  neatline: [number, number, number, number];
  tile_size: number;
  overlap: number;
  tile_overrides: TileOverrides;
};

const triageKey = (mapId: string) => `digitalize-triage-${mapId}`;
const segKey = (mapId: string) => `digitalize-seg-${mapId}`;

/** `base` with any well-formed stored fields applied over it. */
export function loadTriageState(mapId: string, base: TriageState): TriageState {
  const data = readJson<Partial<StoredTriage> | null>(triageKey(mapId), null);
  if (!data) return base;
  return {
    ...base,
    ...(Array.isArray(data.neatline) && data.neatline.length === 4
      ? { neatline: data.neatline }
      : {}),
    ...(data.tile_size ? { tileSize: data.tile_size } : {}),
    ...(data.overlap ? { overlap: data.overlap } : {}),
    ...(data.tile_overrides ? { tileOverrides: data.tile_overrides } : {}),
  };
}

export function saveTriageState(mapId: string, state: TriageState): void {
  if (!state.neatline) return;
  writeJson(triageKey(mapId), {
    neatline: state.neatline,
    tile_size: state.tileSize,
    overlap: state.overlap,
    tile_overrides: state.tileOverrides,
  } satisfies StoredTriage);
}

/** `base` with any stored MapSAM2 config applied over it. */
export function loadSegConfig(mapId: string, base: SegConfig = DEFAULT_SEG_CONFIG): SegConfig {
  const data = readJson<Partial<SegConfig> | null>(segKey(mapId), null);
  if (!data) return { ...base };
  return {
    ...base,
    ...(data.checkpointPath ? { checkpointPath: data.checkpointPath } : {}),
    ...(data.mapsam2Dir ? { mapsam2Dir: data.mapsam2Dir } : {}),
    ...(data.encoder ? { encoder: data.encoder } : {}),
    ...(typeof data.useTextMask === 'boolean' ? { useTextMask: data.useTextMask } : {}),
    ...(typeof data.useWatershed === 'boolean' ? { useWatershed: data.useWatershed } : {}),
  };
}

export function saveSegConfig(mapId: string, cfg: SegConfig): void {
  writeJson(segKey(mapId), cfg);
}
