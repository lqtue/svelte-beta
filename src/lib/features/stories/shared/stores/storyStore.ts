// Story tables dropped (migration 034). The store now works from localStorage only.
// Supabase sync will be re-added when the story system is rebuilt.

import { createPersistedStore } from '$lib/core/utils/persistence/createPersistedStore';
import { randomId } from '$lib/core/utils/id';
import type { Story, StoryPoint, StoryProgress, StoryPlayerState } from '../types';
import * as pointOps from '../pointOps';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/data/supabase/types';

// --- Story Library Store ---

interface StoryLibrary {
  stories: Story[];
}

const STORY_LIBRARY_KEY = 'vma-story-library-v1';
const STORY_PLAYER_KEY = 'vma-story-player-v1';

export function createStoryLibraryStore(_supabase?: SupabaseClient<Database>, userId?: string) {
  const store = createPersistedStore<StoryLibrary>({
    key: STORY_LIBRARY_KEY,
    defaultValue: { stories: [] },
    debounceMs: 300,
  });

  function createStory(title = 'New Story', description = ''): string {
    const story = pointOps.createStoryDraft(userId ?? '', title, description);
    store.update((lib) => ({ stories: [...lib.stories, story] }));
    return story.id;
  }

  function updateStory(
    id: string,
    updates: Partial<Pick<Story, 'title' | 'description' | 'region' | 'mode'>>
  ) {
    store.update((lib) => ({
      stories: lib.stories.map((s) =>
        s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
      ),
    }));
  }

  function deleteStory(id: string) {
    store.update((lib) => ({
      stories: lib.stories.filter((s) => s.id !== id),
    }));
  }

  function getStory(stories: Story[], id: string): Story | undefined {
    return stories.find((s) => s.id === id);
  }

  /** Apply a pure point operation to one story in the library. */
  function editStory(storyId: string, fn: (story: Story) => Story) {
    store.update((lib) => ({
      stories: lib.stories.map((s) => (s.id === storyId ? fn(s) : s)),
    }));
  }

  function addPoint(storyId: string, coordinates: [number, number]): string {
    const pointId = randomId('point');
    editStory(storyId, (s) =>
      pointOps.addPoint(s, pointOps.createPoint(s.points.length, coordinates, { id: pointId }))
    );
    return pointId;
  }

  function updatePoint(storyId: string, pointId: string, updates: Partial<StoryPoint>) {
    editStory(storyId, (s) => pointOps.updatePoint(s, pointId, updates));
  }

  function removePoint(storyId: string, pointId: string) {
    editStory(storyId, (s) => pointOps.removePoint(s, pointId));
  }

  function reorderPoints(storyId: string, fromIndex: number, toIndex: number) {
    editStory(storyId, (s) => pointOps.reorderPoints(s, fromIndex, toIndex));
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
  };
}

// --- Story Player Store ---

const DEFAULT_PLAYER_STATE: StoryPlayerState = {
  activeStoryId: null,
  progress: {},
};

export function createStoryPlayerStore(_supabase?: SupabaseClient<Database>, _userId?: string) {
  const store = createPersistedStore<StoryPlayerState>({
    key: STORY_PLAYER_KEY,
    defaultValue: DEFAULT_PLAYER_STATE,
    debounceMs: 300,
  });

  function startStory(storyId: string) {
    store.update((state) => {
      const existing = state.progress[storyId];
      if (existing && !existing.completedAt) {
        return { ...state, activeStoryId: storyId };
      }
      const progress: StoryProgress = {
        storyId,
        currentPointIndex: 0,
        completedPoints: [],
        startedAt: Date.now(),
      };
      return {
        activeStoryId: storyId,
        progress: { ...state.progress, [storyId]: progress },
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
        currentPointIndex: nextIndex,
        completedAt: isFinished ? Date.now() : undefined,
      };
      return { ...state, progress: { ...state.progress, [storyId]: updated } };
    });
  }

  /**
   * Mark a point visited WITHOUT advancing — the player controls Next.
   * No-op when the story has no progress yet, or the point is already done.
   */
  function markVisited(storyId: string, pointId: string) {
    store.update((state) => {
      const p = state.progress[storyId];
      if (!p || p.completedPoints.includes(pointId)) return state;
      return {
        ...state,
        progress: {
          ...state.progress,
          [storyId]: { ...p, completedPoints: [...p.completedPoints, pointId] },
        },
      };
    });
  }

  /**
   * Step the cursor one stop forward or back, clamped to [0, totalPoints].
   * Stamps `completedAt` the first time the cursor leaves the final stop.
   */
  function advance(storyId: string, direction: 'next' | 'prev', totalPoints: number) {
    store.update((state) => {
      const p = state.progress[storyId];
      if (!p) return state;
      const nextIndex =
        direction === 'next'
          ? Math.min(p.currentPointIndex + 1, totalPoints)
          : Math.max(p.currentPointIndex - 1, 0);
      const finished = nextIndex >= totalPoints;
      return {
        ...state,
        progress: {
          ...state.progress,
          [storyId]: {
            ...p,
            currentPointIndex: nextIndex,
            completedAt: finished ? (p.completedAt ?? Date.now()) : p.completedAt,
          },
        },
      };
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
        progress: rest,
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
    markVisited,
    advance,
    stopStory,
    resetProgress,
    loadFromSupabase: async () => {},
  };
}

export type StoryLibraryStore = ReturnType<typeof createStoryLibraryStore>;
export type StoryPlayerStore = ReturnType<typeof createStoryPlayerStore>;
