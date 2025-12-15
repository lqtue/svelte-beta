// Utility for filtering maps by geographic proximity

import type { Coordinate } from 'ol/coordinate';
import { toLonLat } from 'ol/proj';
import type { MapListItem } from '$lib/viewer/types';

/**
 * Calculates the distance between two geographic coordinates using the Haversine formula
 * @param lat1 - Latitude of first point in degrees
 * @param lon1 - Longitude of first point in degrees
 * @param lat2 - Latitude of second point in degrees
 * @param lon2 - Longitude of second point in degrees
 * @returns Distance in kilometers
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6371; // Earth's radius in kilometers
	const dLat = toRadians(lat2 - lat1);
	const dLon = toRadians(lon2 - lon1);

	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRadians(lat1)) *
			Math.cos(toRadians(lat2)) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

function toRadians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

/**
 * Checks if a point is within a bounding box
 */
function isPointInBounds(
	lon: number,
	lat: number,
	bounds: [number, number, number, number]
): boolean {
	const [minLon, minLat, maxLon, maxLat] = bounds;
	return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

/**
 * Calculates the closest distance from a point to a bounding box
 * Returns 0 if the point is inside the box
 */
function distanceToBox(
	lon: number,
	lat: number,
	bounds: [number, number, number, number]
): number {
	const [minLon, minLat, maxLon, maxLat] = bounds;

	// If point is inside the box, distance is 0
	if (isPointInBounds(lon, lat, bounds)) {
		return 0;
	}

	// Find the closest point on the box
	const closestLon = Math.max(minLon, Math.min(lon, maxLon));
	const closestLat = Math.max(minLat, Math.min(lat, maxLat));

	// Calculate distance to closest point
	return haversineDistance(lat, lon, closestLat, closestLon);
}

/**
 * Checks if a map's geographic bounds are within range of a user's position
 * @param userPos - User's position as {lon, lat}
 * @param mapBounds - Map bounds as [minLon, minLat, maxLon, maxLat]
 * @param radiusKm - Search radius in kilometers
 * @returns True if map is within range
 */
export function isMapInRange(
	userPos: { lon: number; lat: number },
	mapBounds: [number, number, number, number],
	radiusKm: number
): boolean {
	const distance = distanceToBox(userPos.lon, userPos.lat, mapBounds);
	return distance <= radiusKm;
}

/**
 * Filters a list of maps to only those within a certain radius of the user's position
 * @param maps - Array of MapListItem objects
 * @param position - User's position as OpenLayers Coordinate (EPSG:3857)
 * @param radiusKm - Search radius in kilometers (default: 10km)
 * @returns Filtered array of maps within range
 */
export function filterMapsByLocation(
	maps: MapListItem[],
	position: Coordinate | null,
	radiusKm: number = 10
): MapListItem[] {
	if (!position) {
		// No position available, return all maps
		return maps;
	}

	const [lon, lat] = toLonLat(position);

	return maps.filter((map) => {
		// If map has no bounds, include it by default
		if (!map.bounds) {
			return true;
		}

		return isMapInRange({ lon, lat }, map.bounds, radiusKm);
	});
}

/**
 * Sorts maps by distance from user's position (closest first)
 * Maps without bounds are placed at the end
 */
export function sortMapsByDistance(
	maps: MapListItem[],
	position: Coordinate | null
): MapListItem[] {
	if (!position) {
		return maps;
	}

	const [lon, lat] = toLonLat(position);

	return maps.slice().sort((a, b) => {
		// Maps without bounds go to the end
		if (!a.bounds && !b.bounds) return 0;
		if (!a.bounds) return 1;
		if (!b.bounds) return -1;

		const distA = distanceToBox(lon, lat, a.bounds);
		const distB = distanceToBox(lon, lat, b.bounds);

		return distA - distB;
	});
}

/**
 * Gets the distance from a user's position to a map (in kilometers)
 * Returns null if position or map bounds are unavailable
 */
export function getMapDistance(
	map: MapListItem,
	position: Coordinate | null
): number | null {
	if (!position || !map.bounds) {
		return null;
	}

	const [lon, lat] = toLonLat(position);
	return distanceToBox(lon, lat, map.bounds);
}
