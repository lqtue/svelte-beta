// Shared OCR bbox <-> canvas scaling.
//
// `ocr_extractions.global_x/y/w/h` are stored in the *source-image* pixel space
// the OCR run produced (derived from tile_x/y + tile_w/h). The IIIF info.json
// dimensions used by `ImageShell` can differ when the canvas was resized or
// when the OCR ran against a lower-resolution rendering, so every render +
// drag handler scales between the two spaces.
import type { OcrExtraction } from './types';

export interface OcrScale {
	scaleX: number;
	scaleY: number;
	ocrW: number;
	ocrH: number;
}

/** Native bounds of the OCR run (max tile_x + tile_w, max tile_y + tile_h). */
export function ocrNativeBounds(extractions: OcrExtraction[]): { ocrW: number; ocrH: number } {
	if (!extractions.length) return { ocrW: 0, ocrH: 0 };
	let ocrW = 0;
	let ocrH = 0;
	for (const e of extractions) {
		const x2 = (e.tile_x ?? 0) + (e.tile_w ?? 0);
		const y2 = (e.tile_y ?? 0) + (e.tile_h ?? 0);
		if (x2 > ocrW) ocrW = x2;
		if (y2 > ocrH) ocrH = y2;
	}
	return { ocrW, ocrH };
}

/** Compute scale factors from OCR-space to display-image space. Returns null if any dim is 0. */
export function ocrScale(extractions: OcrExtraction[], imgW: number, imgH: number): OcrScale | null {
	const { ocrW, ocrH } = ocrNativeBounds(extractions);
	if (!imgW || !imgH || !ocrW || !ocrH) return null;
	return { scaleX: imgW / ocrW, scaleY: imgH / ocrH, ocrW, ocrH };
}

/** Apply scale to an extraction's global_* fields (OCR-space -> display-space). */
export function scaleExtractionsToDisplay(extractions: OcrExtraction[], imgW: number, imgH: number): OcrExtraction[] {
	const s = ocrScale(extractions, imgW, imgH);
	if (!s) return extractions;
	return extractions.map(ext => ({
		...ext,
		global_x: ext.global_x * s.scaleX,
		global_y: ext.global_y * s.scaleY,
		global_w: ext.global_w * s.scaleX,
		global_h: ext.global_h * s.scaleY,
	}));
}
