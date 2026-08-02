// ---- Allmaps annotation builder ----

export type CornerCoords = {
	NW: [number, number];
	NE: [number, number];
	SE: [number, number];
	SW: [number, number];
};


// ---- IIIF image info resolver ----

export interface IIIFInfoJson {
	'@id'?: string;
	id?: string;
	width: number;
	height: number;
	[key: string]: unknown;
}

export interface IIIFImageInfo {
	imageServiceUrl: string;
	infoJson: IIIFInfoJson;
	width: number;
	height: number;
}

/**
 * Resolve IIIF image info from an Allmaps annotation ID.
 * 1. Fetch the Allmaps annotation for the image
 * 2. Extract the IIIF image service URL
 * 3. Fetch info.json to get dimensions and tile info
 */
import { annotationUrlForSource } from '$lib/shell/warpedOverlay';


/**
 * Resolve just the IIIF info.json URL from an Allmaps annotation ID.
 * Lightweight variant of `fetchIIIFImageInfo` — only the URL, no info.json fetch.
 * Used by IIIF-canvas tools (label, trace, digitalize) to feed `ImageShell`.
 */
export async function resolveIiifInfoUrl(allmapsId: string): Promise<string | null> {
	try {
		const res = await fetch(annotationUrlForSource(allmapsId));
		if (!res.ok) throw new Error(`Allmaps fetch failed: ${res.status}`);
		const annotation = await res.json();
		const sourceId = annotation.items?.[0]?.target?.source?.id;
		if (!sourceId) throw new Error('No source ID in annotation');
		return `${sourceId}/info.json`;
	} catch (err) {
		console.error('[resolveIiifInfoUrl] failed:', err);
		return null;
	}
}
