// Story tables dropped (migration 034). The store now works from localStorage only.
// Supabase sync will be re-added when the story system is rebuilt.

import { createPersistedStore } from '$lib/utils/persistence/createPersistedStore';
import { randomId } from '$lib/utils/id';
import type { Story, StoryPoint, StoryProgress, StoryPlayerState } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/types';

// --- Story Library Store ---

interface StoryLibrary {
	stories: Story[];
	/** @deprecated Use `stories` */
	hunts: Story[];
}

const STORY_LIBRARY_KEY = 'vma-story-library-v1';
const STORY_PLAYER_KEY = 'vma-story-player-v1';

function withHunts(lib: StoryLibrary): StoryLibrary {
	return { ...lib, hunts: lib.stories };
}

export function createStoryLibraryStore(
	_supabase?: SupabaseClient<Database>,
	userId?: string
) {
	const _store = createPersistedStore<StoryLibrary>({
		key: STORY_LIBRARY_KEY,
		defaultValue: { stories: [], hunts: [] },
		debounceMs: 300
	});

	const store = {
		subscribe: _store.subscribe,
		set(val: Partial<StoryLibrary> & { stories: Story[] }) {
			_store.set(withHunts(val as StoryLibrary));
		},
		update(fn: (lib: StoryLibrary) => Partial<StoryLibrary> & { stories?: Story[]; hunts?: Story[] }) {
			_store.update((lib) => {
				const result = fn(lib);
				const stories = result.stories ?? result.hunts ?? lib.stories;
				return { stories, hunts: stories };
			});
		},
		reset: _store.reset
	};

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
	}

	function deleteStory(id: string) {
		store.update((lib) => ({
			stories: lib.stories.filter((s) => s.id !== id)
		}));
	}

	function getStory(stories: Story[], id: string): Story | undefined {
		return stories.find((s) => s.id === id);
	}

	function addPoint(storyId: string, coordinates: [number, number]): string {
		const pointId = randomId('point');
		store.update((lib) => ({
			stories: lib.stories.map((s) => {
				if (s.id !== storyId) return s;
				const point: StoryPoint = {
					id: pointId,
					order: s.points.length,
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
		return pointId;
	}

	function updatePoint(storyId: string, pointId: string, updates: Partial<StoryPoint>) {
		store.update((lib) => ({
			stories: lib.stories.map((s) => {
				if (s.id !== storyId) return s;
				const newPoints = s.points.map((p) => (p.id === pointId ? { ...p, ...updates } : p));
				return { ...s, points: newPoints, stops: newPoints, updatedAt: Date.now() };
			})
		}));
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
		loadFromSupabase: async () => {},
		// Legacy aliases
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
	_supabase?: SupabaseClient<Database>,
	_userId?: string
) {
	const store = createPersistedStore<StoryPlayerState>({
		key: STORY_PLAYER_KEY,
		defaultValue: DEFAULT_PLAYER_STATE,
		debounceMs: 300
	});

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
	}

	function completePoint(storyId: string, pointId: string, totalPoints: number) {
		store.update((state) => {
			const progress = state.progress[storyId];
			if (!progress) return state;
			const completedPoints = [...progress.completedPoints, pointId];
			const nextIndex = progress.currentPointIndex + 1;
			const isFinished = nextIndex >= totalPoints;
			const updated: StoryProgress = {
				...progress,
				completedPoints,
				completedStops: completedPoints,
				currentPointIndex: nextIndex,
				currentStopIndex: nextIndex,
				completedAt: isFinished ? Date.now() : undefined
			};
			return { ...state, progress: { ...state.progress, [storyId]: updated } };
		});
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
		loadFromSupabase: async () => {},
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
