/**
 * Story state management for map scene narratives
 */

import { writable, derived, type Readable } from 'svelte/store';
import type { StoryScene } from '$lib/viewer/types';
import { randomId } from '$lib/core/utils/id';

export const STORY_DELAY_MIN = 1;
export const STORY_DELAY_MAX = 60;
export const STORY_DEFAULT_DELAY = 5;

export interface StoryState {
	scenes: StoryScene[];
	activeSceneIndex: number;
	editingIndex: number | null;
	presenting: boolean;
	autoplay: boolean;
}

export interface StoryStore extends Readable<StoryState> {
	addScene(scene: StoryScene): void;
	updateScene(index: number, scene: StoryScene): void;
	removeScene(index: number): void;
	duplicateScene(index: number): void;
	moveScene(from: number, to: number): void;
	toggleVisibility(index: number): void;
	setActiveIndex(index: number): void;
	setEditingIndex(index: number | null): void;
	setPresenting(presenting: boolean): void;
	setAutoplay(autoplay: boolean): void;
	clear(): void;
	setScenes(scenes: StoryScene[]): void;
}

const DEFAULT_STATE: StoryState = {
	scenes: [],
	activeSceneIndex: 0,
	editingIndex: null,
	presenting: false,
	autoplay: false
};

/**
 * Creates a story state store
 */
export function createStoryStore(): StoryStore {
	const { subscribe, update, set } = writable<StoryState>(DEFAULT_STATE);

	return {
		subscribe,
		addScene(scene: StoryScene) {
			update((state) => ({
				...state,
				scenes: [...state.scenes, scene]
			}));
		},
		updateScene(index: number, scene: StoryScene) {
			update((state) => ({
				...state,
				scenes: state.scenes.map((s, i) => (i === index ? scene : s)),
				editingIndex: null
			}));
		},
		removeScene(index: number) {
			update((state) => {
				const scenes = state.scenes.filter((_, i) => i !== index);
				return {
					...state,
					scenes,
					activeSceneIndex: Math.min(state.activeSceneIndex, Math.max(0, scenes.length - 1))
				};
			});
		},
		duplicateScene(index: number) {
			update((state) => {
				const scene = state.scenes[index];
				if (!scene) return state;
				const copy: StoryScene = {
					...scene,
					id: createSceneId(),
					title: `${scene.title} (copy)`
				};
				const scenes = [...state.scenes];
				scenes.splice(index + 1, 0, copy);
				return { ...state, scenes };
			});
		},
		moveScene(from: number, to: number) {
			update((state) => {
				if (from === to || from < 0 || to < 0 || from >= state.scenes.length || to >= state.scenes.length) {
					return state;
				}
				const scenes = [...state.scenes];
				const [removed] = scenes.splice(from, 1);
				scenes.splice(to, 0, removed);
				return { ...state, scenes };
			});
		},
		toggleVisibility(index: number) {
			update((state) => ({
				...state,
				scenes: state.scenes.map((scene, i) =>
					i === index ? { ...scene, hidden: !scene.hidden } : scene
				)
			}));
		},
		setActiveIndex(index: number) {
			update((state) => ({ ...state, activeSceneIndex: index }));
		},
		setEditingIndex(index: number | null) {
			update((state) => ({ ...state, editingIndex: index }));
		},
		setPresenting(presenting: boolean) {
			update((state) => ({
				...state,
				presenting,
				autoplay: presenting ? state.autoplay : false
			}));
		},
		setAutoplay(autoplay: boolean) {
			update((state) => ({ ...state, autoplay }));
		},
		clear() {
			set(DEFAULT_STATE);
		},
		setScenes(scenes: StoryScene[]) {
			update((state) => ({ ...state, scenes }));
		}
	};
}

/**
 * Creates a scene ID
 */
export function createSceneId(): string {
	return randomId('scene');
}

/**
 * Clamps story delay to valid bounds
 */
export function clampStoryDelay(value: number): number {
	if (!Number.isFinite(value)) return STORY_DEFAULT_DELAY;
	return Math.max(STORY_DELAY_MIN, Math.min(STORY_DELAY_MAX, Math.round(value)));
}

/**
 * Derived store for visible scenes only
 */
export function createVisibleScenesStore(
	store: StoryStore
): Readable<StoryScene[]> {
	return derived(store, ($state) => $state.scenes.filter((scene) => !scene.hidden));
}

/**
 * Finds the first visible scene index starting from a given index
 */
export function findFirstVisibleIndex(scenes: StoryScene[], startIndex = 0): number | null {
	if (!scenes.length) return null;
	for (let i = 0; i < scenes.length; i++) {
		const index = (startIndex + i) % scenes.length;
		if (!scenes[index].hidden) {
			return index;
		}
	}
	return null;
}

/**
 * Finds the next visible scene index in a given direction
 */
export function findNextVisibleIndex(
	scenes: StoryScene[],
	currentIndex: number,
	direction: 1 | -1
): number | null {
	if (!scenes.length) return null;
	for (let step = 1; step <= scenes.length; step++) {
		const index = (currentIndex + direction * step + scenes.length) % scenes.length;
		if (!scenes[index].hidden) {
			return index;
		}
	}
	return null;
}
