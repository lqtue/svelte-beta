// ---- Allmaps annotation builder ----

export type CornerCoords = {
	NW: [number, number];
	NE: [number, number];
	SE: [number, number];
	SW: [number, number];
};

/** Build an Allmaps W3C Georeference Annotation from image corners and a IIIF source. */
export function buildAnnotation(opts: {
	iiifBase: string;
	width: number;
	height: number;
	wgs84Corners: CornerCoords;
	sheetName?: string;
	/** SVG polygon points string for the neatline (e.g. "225,344 6551,344 ...").
	 *  If provided, clips margins/legends. Falls back to full image rectangle. */
	neatlinePixels?: string | null;
}): object {
	const { iiifBase, width, height, wgs84Corners, neatlinePixels } = opts;
	const { NW, NE, SE, SW } = wgs84Corners;

	let svgPoints: string;
	let cornerPixels: [number, number][];

	if (neatlinePixels && neatlinePixels.trim()) {
		svgPoints = neatlinePixels.trim();
		const pts = neatlinePixels.trim().split(/\s+/).map((p) => {
			const [x, y] = p.split(',').map(Number);
			return [x, y] as [number, number];
		});
		const closest = (tx: number, ty: number): [number, number] =>
			pts.reduce((best, p) =>
				Math.hypot(p[0] - tx, p[1] - ty) < Math.hypot(best[0] - tx, best[1] - ty) ? p : best
			);
		cornerPixels = [closest(0, 0), closest(width, 0), closest(width, height), closest(0, height)];
	} else {
		svgPoints = `0,0 ${width},0 ${width},${height} 0,${height}`;
		cornerPixels = [[0, 0], [width, 0], [width, height], [0, height]];
	}

	const cornerGeo: [number, number][] = [NW, NE, SE, SW];
	const features = cornerPixels.map(([px, py], i) => ({
		type: 'Feature',
		properties: { resourceCoords: [px, py] },
		geometry: { type: 'Point', coordinates: cornerGeo[i] },
	}));

	return {
		type: 'AnnotationPage',
		'@context': 'http://www.w3.org/ns/anno.jsonld',
		items: [{
			type: 'Annotation',
			'@context': [
				'http://iiif.io/api/extension/georef/1/context.json',
				'http://iiif.io/api/presentation/3/context.json',
			],
			motivation: 'georeferencing',
			target: {
				type: 'SpecificResource',
				source: { id: iiifBase, type: 'ImageService3', width, height },
				selector: {
					type: 'SvgSelector',
					value: `<svg width="${width}" height="${height}"><polygon points="${svgPoints}" /></svg>`,
				},
			},
			body: {
				type: 'FeatureCollection',
				transformation: { type: 'polynomial', options: { order: 1 } },
				features,
			},
		}],
	};
}

/** Fetch IIIF info.json, retrying up to maxAttempts with delayMs between tries. */
export async function fetchIiifInfoWithRetry(
	iiifBase: string,
	maxAttempts = 6,
	delayMs = 10_000,
): Promise<{ width: number; height: number } | null> {
	const infoUrl = `${iiifBase}/info.json`;
	for (let i = 0; i < maxAttempts; i++) {
		if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
		try {
			const res = await fetch(infoUrl);
			if (res.ok) {
				const info = await res.json();
				if (info.width && info.height) return { width: info.width, height: info.height };
			}
		} catch { /* retry */ }
	}
	return null;
}

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

export async function fetchIIIFImageInfo(allmapsId: string): Promise<IIIFImageInfo> {
	// Step 1: Get the Allmaps annotation to find the IIIF image service URL
	const annotationRes = await fetch(annotationUrlForSource(allmapsId));
	if (!annotationRes.ok) {
		throw new Error(`Failed to fetch Allmaps annotation for ${allmapsId}`);
	}
	const annotation = await annotationRes.json();

	// Extract image service URL from the annotation
	const items = annotation.items;
	if (!items || items.length === 0) {
		throw new Error('No items found in Allmaps annotation');
	}

	const source = items[0]?.target?.source;
	if (!source?.id) {
		throw new Error('No IIIF image service URL found in annotation');
	}

	const imageServiceUrl: string = source.id;

	// Step 2: Fetch info.json
	const infoUrl = imageServiceUrl.endsWith('/')
		? `${imageServiceUrl}info.json`
		: `${imageServiceUrl}/info.json`;

	const infoRes = await fetch(infoUrl);
	if (!infoRes.ok) {
		throw new Error(`Failed to fetch info.json from ${infoUrl}`);
	}
	const infoJson = await infoRes.json();

	const width = infoJson.width;
	const height = infoJson.height;

	if (typeof width !== 'number' || typeof height !== 'number') {
		throw new Error('info.json missing width/height');
	}

	return { imageServiceUrl, infoJson, width, height };
}
