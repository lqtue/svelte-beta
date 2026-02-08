import { writable } from 'svelte/store';
import { createPersistedStore } from '$lib/core/persistence/createPersistedStore';
import { randomId } from '$lib/core/utils/id';
import type { TreasureHunt, HuntStop, HuntPlayerState, HuntProgress } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/types';
import * as huntsApi from '$lib/supabase/hunts';

// --- Hunt Library Store ---

interface HuntLibrary {
  hunts: TreasureHunt[];
}

const HUNT_LIBRARY_KEY = 'vma-hunt-library-v1';
const HUNT_PLAYER_KEY = 'vma-hunt-player-v1';

export function createHuntLibraryStore(
  supabase?: SupabaseClient<Database>,
  userId?: string
) {
  const store = createPersistedStore<HuntLibrary>({
    key: HUNT_LIBRARY_KEY,
    defaultValue: { hunts: [] },
    debounceMs: 300
  });

  // Load from Supabase if authenticated
  async function loadFromSupabase() {
    if (!supabase || !userId) return;
    try {
      const hunts = await huntsApi.fetchUserHunts(supabase, userId);
      if (hunts.length > 0) {
        store.set({ hunts });
      }
    } catch (err) {
      console.error('Failed to load hunts from Supabase:', err);
    }
  }

  // Initialize from Supabase
  loadFromSupabase();

  function createHunt(title = 'New Hunt', description = ''): string {
    const id = randomId('hunt');
    const now = Date.now();
    const hunt: TreasureHunt = {
      id,
      title,
      description,
      stops: [],
      createdAt: now,
      updatedAt: now
    };
    store.update((lib) => ({ hunts: [...lib.hunts, hunt] }));

    // Sync to Supabase
    if (supabase && userId) {
      huntsApi.createHunt(supabase, userId, { title, description }).then((sbId) => {
        if (sbId) {
          // Update local store with Supabase ID
          store.update((lib) => ({
            hunts: lib.hunts.map((h) => (h.id === id ? { ...h, id: sbId } : h))
          }));
        }
      });
    }

    return id;
  }

  function updateHunt(id: string, updates: Partial<Pick<TreasureHunt, 'title' | 'description' | 'region'>>) {
    store.update((lib) => ({
      hunts: lib.hunts.map((h) =>
        h.id === id ? { ...h, ...updates, updatedAt: Date.now() } : h
      )
    }));

    if (supabase && userId) {
      huntsApi.updateHunt(supabase, id, updates);
    }
  }

  function deleteHunt(id: string) {
    store.update((lib) => ({
      hunts: lib.hunts.filter((h) => h.id !== id)
    }));

    if (supabase && userId) {
      huntsApi.deleteHunt(supabase, id);
    }
  }

  function getHunt(hunts: TreasureHunt[], id: string): TreasureHunt | undefined {
    return hunts.find((h) => h.id === id);
  }

  function addStop(huntId: string, coordinates: [number, number]): string {
    const stopId = randomId('stop');
    let sortOrder = 0;
    store.update((lib) => ({
      hunts: lib.hunts.map((h) => {
        if (h.id !== huntId) return h;
        sortOrder = h.stops.length;
        const stop: HuntStop = {
          id: stopId,
          order: sortOrder,
          title: `Stop ${h.stops.length + 1}`,
          description: '',
          coordinates,
          triggerRadius: 10,
          interaction: 'proximity'
        };
        return { ...h, stops: [...h.stops, stop], updatedAt: Date.now() };
      })
    }));

    if (supabase && userId) {
      huntsApi.addStop(supabase, huntId, {
        title: `Stop ${sortOrder + 1}`,
        coordinates,
        sortOrder
      }).then((sbId) => {
        if (sbId) {
          store.update((lib) => ({
            hunts: lib.hunts.map((h) => {
              if (h.id !== huntId) return h;
              return {
                ...h,
                stops: h.stops.map((s) => (s.id === stopId ? { ...s, id: sbId } : s))
              };
            })
          }));
        }
      });
    }

    return stopId;
  }

  function updateStop(huntId: string, stopId: string, updates: Partial<HuntStop>) {
    store.update((lib) => ({
      hunts: lib.hunts.map((h) => {
        if (h.id !== huntId) return h;
        return {
          ...h,
          stops: h.stops.map((s) => (s.id === stopId ? { ...s, ...updates } : s)),
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
      huntsApi.updateStop(supabase, stopId, dbUpdates as Parameters<typeof huntsApi.updateStop>[2]);
    }
  }

  function removeStop(huntId: string, stopId: string) {
    store.update((lib) => ({
      hunts: lib.hunts.map((h) => {
        if (h.id !== huntId) return h;
        const filtered = h.stops.filter((s) => s.id !== stopId);
        const reordered = filtered.map((s, i) => ({ ...s, order: i }));
        return { ...h, stops: reordered, updatedAt: Date.now() };
      })
    }));

    if (supabase && userId) {
      huntsApi.removeStop(supabase, stopId);
    }
  }

  function reorderStops(huntId: string, fromIndex: number, toIndex: number) {
    store.update((lib) => ({
      hunts: lib.hunts.map((h) => {
        if (h.id !== huntId) return h;
        const stops = [...h.stops];
        const [moved] = stops.splice(fromIndex, 1);
        stops.splice(toIndex, 0, moved);
        const reordered = stops.map((s, i) => ({ ...s, order: i }));
        return { ...h, stops: reordered, updatedAt: Date.now() };
      })
    }));
  }

  return {
    subscribe: store.subscribe,
    set: store.set,
    update: store.update,
    reset: store.reset,
    createHunt,
    updateHunt,
    deleteHunt,
    getHunt,
    addStop,
    updateStop,
    removeStop,
    reorderStops,
    loadFromSupabase
  };
}

// --- Hunt Player Store ---

const DEFAULT_PLAYER_STATE: HuntPlayerState = {
  activeHuntId: null,
  progress: {}
};

export function createHuntPlayerStore(
  supabase?: SupabaseClient<Database>,
  userId?: string
) {
  const store = createPersistedStore<HuntPlayerState>({
    key: HUNT_PLAYER_KEY,
    defaultValue: DEFAULT_PLAYER_STATE,
    debounceMs: 300
  });

  // Load progress from Supabase
  async function loadFromSupabase() {
    if (!supabase || !userId) return;
    try {
      const progress = await huntsApi.fetchAllProgress(supabase, userId);
      if (Object.keys(progress).length > 0) {
        store.update((state) => ({
          ...state,
          progress: { ...state.progress, ...progress }
        }));
      }
    } catch (err) {
      console.error('Failed to load hunt progress from Supabase:', err);
    }
  }

  loadFromSupabase();

  function startHunt(huntId: string) {
    store.update((state) => {
      const existing = state.progress[huntId];
      if (existing && !existing.completedAt) {
        return { ...state, activeHuntId: huntId };
      }
      const progress: HuntProgress = {
        huntId,
        currentStopIndex: 0,
        completedStops: [],
        startedAt: Date.now()
      };
      return {
        activeHuntId: huntId,
        progress: { ...state.progress, [huntId]: progress }
      };
    });

    if (supabase && userId) {
      huntsApi.upsertProgress(supabase, userId, huntId, {
        current_stop_index: 0,
        completed_stops: []
      });
    }
  }

  function completeStop(huntId: string, stopId: string, totalStops: number) {
    let updatedProgress: HuntProgress | undefined;

    store.update((state) => {
      const progress = state.progress[huntId];
      if (!progress) return state;
      const completedStops = [...progress.completedStops, stopId];
      const nextIndex = progress.currentStopIndex + 1;
      const isFinished = nextIndex >= totalStops;
      updatedProgress = {
        ...progress,
        completedStops,
        currentStopIndex: nextIndex,
        completedAt: isFinished ? Date.now() : undefined
      };
      return {
        ...state,
        progress: {
          ...state.progress,
          [huntId]: updatedProgress
        }
      };
    });

    if (supabase && userId && updatedProgress) {
      huntsApi.upsertProgress(supabase, userId, huntId, {
        current_stop_index: updatedProgress.currentStopIndex,
        completed_stops: updatedProgress.completedStops,
        completed_at: updatedProgress.completedAt
          ? new Date(updatedProgress.completedAt).toISOString()
          : null
      });
    }
  }

  function stopHunt() {
    store.update((state) => ({ ...state, activeHuntId: null }));
  }

  function resetProgress(huntId: string) {
    store.update((state) => {
      const { [huntId]: _, ...rest } = state.progress;
      return {
        ...state,
        activeHuntId: state.activeHuntId === huntId ? null : state.activeHuntId,
        progress: rest
      };
    });
  }

  return {
    subscribe: store.subscribe,
    set: store.set,
    update: store.update,
    reset: store.reset,
    startHunt,
    completeStop,
    stopHunt,
    resetProgress,
    loadFromSupabase
  };
}

export type HuntLibraryStore = ReturnType<typeof createHuntLibraryStore>;
export type HuntPlayerStore = ReturnType<typeof createHuntPlayerStore>;
