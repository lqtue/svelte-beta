// Device orientation tracking utilities

export interface DeviceOrientation {
	alpha: number; // Compass heading (0-360 degrees)
	beta: number; // Front-to-back tilt (-180 to 180)
	gamma: number; // Left-to-right tilt (-90 to 90)
}

let orientationCallback: ((orientation: DeviceOrientation) => void) | null = null;
let orientationHandler: ((event: DeviceOrientationEvent) => void) | null = null;

/**
 * Requests permission to access device orientation (required on iOS 13+)
 * @returns Promise that resolves to true if permission granted, false otherwise
 */
export async function requestOrientationPermission(): Promise<boolean> {
	// Check if permission API exists (iOS 13+)
	if (
		typeof DeviceOrientationEvent !== 'undefined' &&
		typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
			.requestPermission === 'function'
	) {
		try {
			const permission = await (
				DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }
			).requestPermission();
			return permission === 'granted';
		} catch (error) {
			console.warn('Error requesting orientation permission:', error);
			return false;
		}
	}

	// Permission not required (Android or older iOS)
	return true;
}

/**
 * Starts tracking device orientation
 * @param callback - Function called with orientation data on each update
 * @returns Cleanup function to stop tracking, or null if not supported
 */
export function startOrientationTracking(
	callback: (orientation: DeviceOrientation) => void
): (() => void) | null {
	if (typeof window === 'undefined' || !window.DeviceOrientationEvent) {
		console.warn('DeviceOrientation API not supported');
		return null;
	}

	orientationCallback = callback;

	// Throttle updates to max 10 Hz (every 100ms)
	let lastUpdate = 0;
	const throttleMs = 100;

	orientationHandler = (event: DeviceOrientationEvent) => {
		const now = Date.now();
		if (now - lastUpdate < throttleMs) {
			return;
		}
		lastUpdate = now;

		if (event.alpha === null || event.beta === null || event.gamma === null) {
			return;
		}

		const orientation: DeviceOrientation = {
			alpha: event.alpha,
			beta: event.beta,
			gamma: event.gamma
		};

		orientationCallback?.(orientation);
	};

	window.addEventListener('deviceorientation', orientationHandler, true);

	// Return cleanup function
	return () => {
		stopOrientationTracking();
	};
}

/**
 * Stops tracking device orientation
 */
export function stopOrientationTracking(): void {
	if (orientationHandler) {
		window.removeEventListener('deviceorientation', orientationHandler, true);
		orientationHandler = null;
	}
	orientationCallback = null;
}

/**
 * Checks if device orientation is supported
 */
export function isOrientationSupported(): boolean {
	return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

/**
 * Normalizes compass heading to 0-360 range
 */
export function normalizeHeading(alpha: number): number {
	let heading = alpha % 360;
	if (heading < 0) {
		heading += 360;
	}
	return heading;
}
