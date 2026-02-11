export type StoryMode = 'guided' | 'adventure';
export type PointChallengeType = 'none' | 'question' | 'reach';

export interface PointChallenge {
	type: PointChallengeType;
	question?: string;
	answer?: string;
	triggerRadius?: number; // for 'reach' type (meters)
}

export interface StoryPoint {
	id: string;
	order: number;
	title: string;
	description: string;
	hint?: string;
	quest?: string;
	coordinates: [number, number]; // [lon, lat] EPSG:4326
	triggerRadius: number; // meters, default 10
	interaction: StopInteraction;
	challenge: PointChallenge;
	qrPayload?: string;
	overlayMapId?: string; // Allmaps ID — historical map revealed at this point
	camera?: { center: [number, number]; zoom: number; rotation?: number };
}

export interface Story {
	id: string;
	title: string;
	description: string;
	mode: StoryMode;
	points: StoryPoint[];
	/** @deprecated Use `points` — kept for backward compat */
	stops: StoryPoint[];
	region?: { center: [number, number]; zoom: number };
	createdAt: number;
	updatedAt: number;
	isPublic: boolean;
	authorId: string;
}

export interface StoryProgress {
	storyId: string;
	currentPointIndex: number;
	completedPoints: string[];
	/** @deprecated Use `currentPointIndex` */
	currentStopIndex: number;
	/** @deprecated Use `completedPoints` */
	completedStops: string[];
	/** @deprecated Use `storyId` */
	huntId: string;
	startedAt: number;
	completedAt?: number;
}

export interface StoryPlayerState {
	activeStoryId: string | null;
	progress: Record<string, StoryProgress>;
}

// Legacy compat — keep for transition period
export type StopInteraction = 'proximity' | 'qr' | 'camera';

// Aliases for backward compatibility with hunt-era code
export type TreasureHunt = Story;
export type HuntStop = StoryPoint;
export type HuntProgress = StoryProgress;
export type HuntPlayerState = StoryPlayerState;
