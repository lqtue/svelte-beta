import type { GeolocationConfig, TrackingCallbacks } from './types';

export const DEFAULT_CONFIG: GeolocationConfig = {
	enableHighAccuracy: true,
	timeout: 10000,
	maximumAge: 0
};

export function startTracking(
	callbacks: TrackingCallbacks,
	config: GeolocationConfig = DEFAULT_CONFIG
): number | null {
	if (!('geolocation' in navigator)) {
		callbacks.onError({
			code: 0,
			message: 'Geolocation not supported',
			PERMISSION_DENIED: 1,
			POSITION_UNAVAILABLE: 2,
			TIMEOUT: 3
		} as GeolocationPositionError);
		return null;
	}

	return navigator.geolocation.watchPosition(callbacks.onPosition, callbacks.onError, config);
}

export function stopTracking(watchId: number): void {
	navigator.geolocation.clearWatch(watchId);
}

export function formatError(error: GeolocationPositionError): string {
	switch (error.code) {
		case error.PERMISSION_DENIED:
			return 'Location access denied. Please enable location permissions.';
		case error.POSITION_UNAVAILABLE:
			return 'Location unavailable. Please check your device settings.';
		case error.TIMEOUT:
			return 'Location request timed out. Please try again.';
		default:
			return 'An unknown location error occurred.';
	}
}
