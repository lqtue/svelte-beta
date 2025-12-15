// Utility for fetching and calculating geographic bounds from Allmaps annotations

// In-memory cache to avoid repeated API calls
const boundsCache: Map<string, [number, number, number, number] | null> = new Map();

interface GroundControlPoint {
	world: [number, number];
	// Other fields exist but we only need world coordinates
}

/**
 * Fetches an Allmaps annotation and calculates its geographic bounding box
 * @param mapId - The Allmaps annotation ID
 * @returns Bounds as [minLon, minLat, maxLon, maxLat] or null if unavailable
 */
export async function fetchAnnotationBounds(
	mapId: string
): Promise<[number, number, number, number] | null> {
	// Check cache first
	if (boundsCache.has(mapId)) {
		return boundsCache.get(mapId) || null;
	}

	try {
		const response = await fetch(`https://annotations.allmaps.org/images/${mapId}`);
		if (!response.ok) {
			console.warn(`Failed to fetch annotation for ${mapId}: ${response.status}`);
			boundsCache.set(mapId, null);
			return null;
		}

		const annotation = await response.json();

		// Extract ground control points
		const gcps = extractGCPs(annotation);
		if (!gcps || gcps.length === 0) {
			// Some maps may not have GCPs - this is expected, cache null silently
			boundsCache.set(mapId, null);
			return null;
		}

		// Calculate bounding box from GCPs
		const lons = gcps.map((p) => p.world[0]);
		const lats = gcps.map((p) => p.world[1]);

		const bounds: [number, number, number, number] = [
			Math.min(...lons),
			Math.min(...lats),
			Math.max(...lons),
			Math.max(...lats)
		];

		// Cache and return
		boundsCache.set(mapId, bounds);
		return bounds;
	} catch (error) {
		console.error(`Error fetching bounds for ${mapId}:`, error);
		boundsCache.set(mapId, null);
		return null;
	}
}

/**
 * Extracts ground control points from an Allmaps annotation
 * Allmaps annotation structure can vary, this handles common formats
 */
function extractGCPs(annotation: unknown): GroundControlPoint[] {
	if (!annotation || typeof annotation !== 'object') {
		return [];
	}

	const ann = annotation as Record<string, unknown>;

	// Allmaps annotations follow W3C Web Annotation model
	// GCPs are typically in the 'body' or nested within 'target'
	// The exact structure depends on annotation version

	// Try to find resourceCoords (Georeference Annotation format)
	if (ann.body && typeof ann.body === 'object') {
		const body = ann.body as Record<string, unknown>;

		// Look for geometry in body
		if (body.features && Array.isArray(body.features)) {
			const gcps: GroundControlPoint[] = [];
			for (const feature of body.features) {
				if (
					feature &&
					typeof feature === 'object' &&
					'geometry' in feature &&
					feature.geometry &&
					typeof feature.geometry === 'object'
				) {
					const geom = feature.geometry as Record<string, unknown>;
					if (geom.coordinates && Array.isArray(geom.coordinates)) {
						// Coordinates in [lon, lat] format
						const coords = geom.coordinates as number[];
						if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
							gcps.push({
								world: [coords[0], coords[1]]
							});
						}
					}
				}
			}
			if (gcps.length > 0) {
				return gcps;
			}
		}

		// Alternative: look for transformation or gcps array
		if (body.transformation && typeof body.transformation === 'object') {
			const transformation = body.transformation as Record<string, unknown>;
			if (transformation.gcps && Array.isArray(transformation.gcps)) {
				return transformation.gcps
					.filter(
						(gcp): gcp is Record<string, unknown> =>
							gcp !== null && typeof gcp === 'object'
					)
					.filter((gcp) => {
						const world = gcp.world as unknown;
						return Array.isArray(world) && world.length >= 2;
					})
					.map((gcp) => {
						const world = gcp.world as number[];
						return {
							world: [world[0], world[1]]
						};
					});
			}
		}
	}

	// Fallback: try to find any coordinate-like structure
	// This is a last resort for unexpected formats
	if (ann.gcps && Array.isArray(ann.gcps)) {
		return ann.gcps
			.filter((gcp): gcp is Record<string, unknown> => gcp !== null && typeof gcp === 'object')
			.filter((gcp) => {
				const world = gcp.world as unknown;
				return Array.isArray(world) && world.length >= 2;
			})
			.map((gcp) => {
				const world = gcp.world as number[];
				return {
					world: [world[0], world[1]]
				};
			});
	}

	return [];
}

/**
 * Fetches bounds for multiple maps with concurrency control
 * @param mapIds - Array of map IDs to fetch
 * @param concurrency - Maximum concurrent requests (default: 5)
 */
export async function fetchMultipleBounds(
	mapIds: string[],
	concurrency: number = 5
): Promise<Map<string, [number, number, number, number] | null>> {
	const results = new Map<string, [number, number, number, number] | null>();

	// Process in batches
	for (let i = 0; i < mapIds.length; i += concurrency) {
		const batch = mapIds.slice(i, i + concurrency);
		const promises = batch.map(async (id) => {
			const bounds = await fetchAnnotationBounds(id);
			results.set(id, bounds);
		});
		await Promise.all(promises);
	}

	return results;
}

/**
 * Clears the bounds cache (useful for testing or memory management)
 */
export function clearBoundsCache(): void {
	boundsCache.clear();
}
