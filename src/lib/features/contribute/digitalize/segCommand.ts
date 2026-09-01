/**
 * segCommand.ts — builds the MapSAM2 inference command the Segmentation panel
 * hands to Colab. Pure string assembly; no I/O.
 */

export type SegConfig = {
  checkpointPath: string;
  mapsam2Dir: string;
  encoder: 'vit_t' | 'vit_s' | 'vit_b' | 'vit_l';
  useTextMask: boolean;
  useWatershed: boolean;
};

export const DEFAULT_SEG_CONFIG: SegConfig = {
  checkpointPath: '/content/drive/MyDrive/mapsam2_checkpoint.pth',
  mapsam2Dir: '/content/MapSAM2',
  encoder: 'vit_s',
  useTextMask: true,
  useWatershed: true,
};

/**
 * With a validated OCR run the model runs LoRA-prompted off those toponyms;
 * without one it falls back to automatic mode.
 */
export function buildSegCommand(
  mapId: string | null | undefined,
  ocrRunId: string | null | undefined,
  cfg: SegConfig
): string {
  if (!mapId) return '';
  const hasOcr = !!ocrRunId;
  return [
    `python work/MapSAM2/inference_tiles_as_video.py`,
    `  --map-id ${mapId}`,
    `  --checkpoint ${cfg.checkpointPath}`,
    `  --encoder ${cfg.encoder}`,
    hasOcr ? `  --lora --mapsam2-dir ${cfg.mapsam2Dir}` : null,
    hasOcr ? `  --mode prompted` : `  --mode automatic`,
    hasOcr ? `  --ocr-run-id ${ocrRunId}` : null,
    `  --tile-size 1024 --overlap 128`,
    cfg.useTextMask ? `  --text-mask` : null,
    cfg.useWatershed ? `  --watershed` : null,
    `  --device cuda`,
    `  --out-json footprints.json --preview --write-supabase`,
  ]
    .filter(Boolean)
    .join(' \\\n');
}
