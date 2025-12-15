export interface GeolocationConfig {
	enableHighAccuracy: boolean;
	timeout: number;
	maximumAge: number;
}

export interface TrackingCallbacks {
	onPosition: (position: GeolocationPosition) => void;
	onError: (error: GeolocationPositionError) => void;
}

export type TrackingState = 'inactive' | 'active' | 'paused';
