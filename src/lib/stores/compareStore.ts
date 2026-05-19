/**
 * Compare store — holds a small set of map IDs (max 4) the user wants to view
 * side-by-side or stacked. Independent of mapStore.activeMapId so the primary
 * "active" map can still drive single-view behaviour when compare mode is off.
 *
 * compareMode === 'off'   → no compare UI, single map view as before
 * compareMode === 'split' → two panes (uses ids[0] and ids[1])
 * compareMode === 'stack' → primary map view with ids[1..] stacked as extra layers
 */
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type CompareMode = 'off' | 'split' | 'stack';

export interface CompareState {
  ids: string[];          // map UUIDs (from maps.id)
  mode: CompareMode;
}

const STORAGE_KEY = 'vma-compare-v1';
const MAX_IDS = 4;
const DEFAULT: CompareState = { ids: [], mode: 'off' };

function load(): CompareState {
  if (!browser) return { ...DEFAULT };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw);
    return {
      ids: Array.isArray(parsed.ids) ? parsed.ids.slice(0, MAX_IDS) : [],
      mode: parsed.mode === 'split' || parsed.mode === 'stack' ? parsed.mode : 'off',
    };
  } catch {
    return { ...DEFAULT };
  }
}

function persist(s: CompareState) {
  if (!browser) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function create() {
  const { subscribe, update, set } = writable<CompareState>(load());

  return {
    subscribe,

    add(id: string) {
      update((s) => {
        if (!id || s.ids.includes(id)) return s;
        if (s.ids.length >= MAX_IDS) return s;
        const ids = [...s.ids, id];
        // Auto-enable split mode the moment a second map enters the tray.
        const mode: CompareMode = ids.length >= 2 && s.mode === 'off' ? 'split' : s.mode;
        const next = { ids, mode };
        persist(next);
        return next;
      });
    },

    remove(id: string) {
      update((s) => {
        const ids = s.ids.filter((x) => x !== id);
        const mode: CompareMode = ids.length < 2 ? 'off' : s.mode;
        const next = { ids, mode };
        persist(next);
        return next;
      });
    },

    clear() {
      const next = { ...DEFAULT };
      persist(next);
      set(next);
    },

    setMode(mode: CompareMode) {
      update((s) => {
        const next = { ...s, mode };
        persist(next);
        return next;
      });
    },

    has(id: string): boolean {
      let result = false;
      const unsub = subscribe((s) => { result = s.ids.includes(id); });
      unsub();
      return result;
    },
  };
}

export const compareStore = create();
export const MAX_COMPARE = MAX_IDS;
