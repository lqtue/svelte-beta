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
export async function fetchIIIFImageInfo(allmapsId: string): Promise<IIIFImageInfo> {
	// Step 1: Get the Allmaps annotation to find the IIIF image service URL
	const annotationRes = await fetch(`https://annotations.allmaps.org/images/${allmapsId}`);
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
