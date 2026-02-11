import { createPersistedStore } from '$lib/core/persistence/createPersistedStore';
import { randomId } from '$lib/core/utils/id';
import type { Story, StoryPoint, StoryProgress, StoryPlayerState } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/types';
import * as storiesApi from '$lib/supabase/stories';

// --- Story Library Store ---

interface StoryLibrary {
	stories: Story[];
	/** @deprecated Use `stories` — kept for backward compat */
	hunts: Story[];
}

const STORY_LIBRARY_KEY = 'vma-story-library-v1';
const STORY_PLAYER_KEY = 'vma-story-player-v1';

/** Helper: keep hunts = stories for backward compat */
function withHunts(lib: StoryLibrary): StoryLibrary {
	return { ...lib, hunts: lib.stories };
}

export function createStoryLibraryStore(
	supabase?: SupabaseClient<Database>,
	userId?: string
) {
	const _store = createPersistedStore<StoryLibrary>({
		key: STORY_LIBRARY_KEY,
		defaultValue: { stories: [], hunts: [] },
		debounceMs: 300
	});

	// Wrap store so hunts always mirrors stories
	const store = {
		subscribe: _store.subscribe,
		set(val: Partial<StoryLibrary> & { stories: Story[] }) {
			_store.set(withHunts(val as StoryLibrary));
		},
		update(fn: (lib: StoryLibrary) => Partial<StoryLibrary> & { stories?: Story[]; hunts?: Story[] }) {
			_store.update((lib) => {
				const result = fn(lib);
				// Accept either { stories } or { hunts } and sync both
				const stories = result.stories ?? result.hunts ?? lib.stories;
				return { stories, hunts: stories };
			});
		},
		reset: _store.reset
	};

	// Load from Supabase if authenticated
	async function loadFromSupabase() {
		if (!supabase || !userId) return;
		try {
			const stories = await storiesApi.fetchUserStories(supabase, userId);
			if (stories.length > 0) {
				store.set({ stories, hunts: stories });
			}
		} catch (err) {
			console.error('Failed to load stories from Supabase:', err);
		}
	}

	// Initialize from Supabase
	loadFromSupabase();

	function createStory(title = 'New Story', description = ''): string {
		const id = randomId('story');
		const now = Date.now();
		const story: Story = {
			id,
			title,
			description,
			mode: 'guided',
			points: [],
			stops: [],
			createdAt: now,
			updatedAt: now,
			isPublic: false,
			authorId: userId ?? ''
		};
		store.update((lib) => ({ stories: [...lib.stories, story] }));

		// Sync to Supabase
		if (supabase && userId) {
			storiesApi.createStory(supabase, userId, { title, description }).then((sbId) => {
				if (sbId) {
					store.update((lib) => ({
						stories: lib.stories.map((s) => (s.id === id ? { ...s, id: sbId } : s))
					}));
				}
			});
		}

		return id;
	}

	function updateStory(
		id: string,
		updates: Partial<Pick<Story, 'title' | 'description' | 'region' | 'mode'>>
	) {
		store.update((lib) => ({
			stories: lib.stories.map((s) =>
				s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
			)
		}));

		if (supabase && userId) {
			storiesApi.updateStory(supabase, id, updates);
		}
	}

	function deleteStory(id: string) {
		store.update((lib) => ({
			stories: lib.stories.filter((s) => s.id !== id)
		}));

		if (supabase && userId) {
			storiesApi.deleteStory(supabase, id);
		}
	}

	function getStory(stories: Story[], id: string): Story | undefined {
		return stories.find((s) => s.id === id);
	}

	function addPoint(storyId: string, coordinates: [number, number]): string {
		const pointId = randomId('point');
		let sortOrder = 0;
		store.update((lib) => ({
			stories: lib.stories.map((s) => {
				if (s.id !== storyId) return s;
				sortOrder = s.points.length;
				const point: StoryPoint = {
					id: pointId,
					order: sortOrder,
					title: `Point ${s.points.length + 1}`,
					description: '',
					coordinates,
					triggerRadius: 10,
					interaction: 'proximity',
					challenge: { type: 'reach', triggerRadius: 10 }
				};
				const newPoints = [...s.points, point];
				return { ...s, points: newPoints, stops: newPoints, updatedAt: Date.now() };
			})
		}));

		if (supabase && userId) {
			storiesApi.addStop(supabase, storyId, {
				title: `Point ${sortOrder + 1}`,
				coordinates,
				sortOrder
			}).then((sbId) => {
				if (sbId) {
					store.update((lib) => ({
						stories: lib.stories.map((s) => {
							if (s.id !== storyId) return s;
							return {
								...s,
								points: s.points.map((p) => (p.id === pointId ? { ...p, id: sbId } : p))
							};
						})
					}));
				}
			});
		}

		return pointId;
	}

	function updatePoint(storyId: string, pointId: string, updates: Partial<StoryPoint>) {
		store.update((lib) => ({
			stories: lib.stories.map((s) => {
				if (s.id !== storyId) return s;
				const newPoints = s.points.map((p) => (p.id === pointId ? { ...p, ...updates } : p));
				return {
					...s,
					points: newPoints,
					stops: newPoints,
					updatedAt: Date.now()
				};
			})
		}));

		if (supabase && userId) {
			const dbUpdates: Record<string, unknown> = {};
			if (updates.title !== undefined) dbUpdates.title = updates.title;
			if (updates.description !== undefined) dbUpdates.description = updates.description;
			if (updates.hint !== undefined) dbUpdates.hint = updates.hint;
			if (updates.quest !== undefined) dbUpdates.quest = updates.quest;
			if (updates.coordinates !== undefined) {
				dbUpdates.lon = updates.coordinates[0];
				dbUpdates.lat = updates.coordinates[1];
			}
			if (updates.triggerRadius !== undefined) dbUpdates.trigger_radius = updates.triggerRadius;
			if (updates.interaction !== undefined) dbUpdates.interaction = updates.interaction;
			if (updates.qrPayload !== undefined) dbUpdates.qr_payload = updates.qrPayload;
			if (updates.overlayMapId !== undefined) dbUpdates.overlay_map_id = updates.overlayMapId;
			if (updates.order !== undefined) dbUpdates.sort_order = updates.order;
			storiesApi.updateStop(
				supabase,
				pointId,
				dbUpdates as Parameters<typeof storiesApi.updateStop>[2]
			);
		}
	}

	function removePoint(storyId: string, pointId: string) {
		store.update((lib) => ({
			stories: lib.stories.map((s) => {
				if (s.id !== storyId) return s;
				const filtered = s.points.filter((p) => p.id !== pointId);
				const reordered = filtered.map((p, i) => ({ ...p, order: i }));
				return { ...s, points: reordered, stops: reordered, updatedAt: Date.now() };
			})
		}));

		if (supabase && userId) {
			storiesApi.removeStop(supabase, pointId);
		}
	}

	function reorderPoints(storyId: string, fromIndex: number, toIndex: number) {
		store.update((lib) => ({
			stories: lib.stories.map((s) => {
				if (s.id !== storyId) return s;
				const points = [...s.points];
				const [moved] = points.splice(fromIndex, 1);
				points.splice(toIndex, 0, moved);
				const reordered = points.map((p, i) => ({ ...p, order: i }));
				return { ...s, points: reordered, stops: reordered, updatedAt: Date.now() };
			})
		}));
	}

	// Backward compat: expose as "hunts" getter for legacy code
	return {
		subscribe: store.subscribe,
		set: store.set,
		update: store.update,
		reset: store.reset,
		createStory,
		updateStory,
		deleteStory,
		getStory,
		addPoint,
		updatePoint,
		removePoint,
		reorderPoints,
		loadFromSupabase,
		// Legacy aliases for transition
		createHunt: createStory,
		updateHunt: updateStory,
		deleteHunt: deleteStory,
		getHunt: getStory,
		addStop: addPoint,
		updateStop: updatePoint,
		removeStop: removePoint,
		reorderStops: reorderPoints
	};
}

// --- Story Player Store ---

const DEFAULT_PLAYER_STATE: StoryPlayerState = {
	activeStoryId: null,
	progress: {}
};

export function createStoryPlayerStore(
	supabase?: SupabaseClient<Database>,
	userId?: string
) {
	const store = createPersistedStore<StoryPlayerState>({
		key: STORY_PLAYER_KEY,
		defaultValue: DEFAULT_PLAYER_STATE,
		debounceMs: 300
	});

	// Load progress from Supabase
	async function loadFromSupabase() {
		if (!supabase || !userId) return;
		try {
			const progress = await storiesApi.fetchAllProgress(supabase, userId);
			if (Object.keys(progress).length > 0) {
				store.update((state) => ({
					...state,
					progress: { ...state.progress, ...progress }
				}));
			}
		} catch (err) {
			console.error('Failed to load story progress from Supabase:', err);
		}
	}

	loadFromSupabase();

	function startStory(storyId: string) {
		store.update((state) => {
			const existing = state.progress[storyId];
			if (existing && !existing.completedAt) {
				return { ...state, activeStoryId: storyId };
			}
			const progress: StoryProgress = {
				storyId,
				huntId: storyId,
				currentPointIndex: 0,
				currentStopIndex: 0,
				completedPoints: [],
				completedStops: [],
				startedAt: Date.now()
			};
			return {
				activeStoryId: storyId,
				progress: { ...state.progress, [storyId]: progress }
			};
		});

		if (supabase && userId) {
			storiesApi.upsertProgress(supabase, userId, storyId, {
				current_stop_index: 0,
				completed_stops: []
			});
		}
	}

	function completePoint(storyId: string, pointId: string, totalPoints: number) {
		let updatedProgress: StoryProgress | undefined;

		store.update((state) => {
			const progress = state.progress[storyId];
			if (!progress) return state;
			const completedPoints = [...progress.completedPoints, pointId];
			const nextIndex = progress.currentPointIndex + 1;
			const isFinished = nextIndex >= totalPoints;
			updatedProgress = {
				...progress,
				completedPoints,
				completedStops: completedPoints,
				currentPointIndex: nextIndex,
				currentStopIndex: nextIndex,
				completedAt: isFinished ? Date.now() : undefined
			};
			return {
				...state,
				progress: {
					...state.progress,
					[storyId]: updatedProgress
				}
			};
		});

		if (supabase && userId && updatedProgress) {
			storiesApi.upsertProgress(supabase, userId, storyId, {
				current_stop_index: updatedProgress.currentPointIndex,
				completed_stops: updatedProgress.completedPoints,
				completed_at: updatedProgress.completedAt
					? new Date(updatedProgress.completedAt).toISOString()
					: null
			});
		}
	}

	function stopStory() {
		store.update((state) => ({ ...state, activeStoryId: null }));
	}

	function resetProgress(storyId: string) {
		store.update((state) => {
			const { [storyId]: _, ...rest } = state.progress;
			return {
				...state,
				activeStoryId: state.activeStoryId === storyId ? null : state.activeStoryId,
				progress: rest
			};
		});
	}

	return {
		subscribe: store.subscribe,
		set: store.set,
		update: store.update,
		reset: store.reset,
		startStory,
		completePoint,
		stopStory,
		resetProgress,
		loadFromSupabase,
		// Legacy aliases
		startHunt: startStory,
		completeStop: completePoint,
		stopHunt: stopStory
	};
}

export type StoryLibraryStore = ReturnType<typeof createStoryLibraryStore>;
export type StoryPlayerStore = ReturnType<typeof createStoryPlayerStore>;

// Legacy aliases
export const createHuntLibraryStore = createStoryLibraryStore;
export const createHuntPlayerStore = createStoryPlayerStore;
