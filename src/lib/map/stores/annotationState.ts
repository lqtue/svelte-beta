import { writable, type Readable } from 'svelte/store';
import type { AnnotationSummary } from '$lib/viewer/types';

interface AnnotationStateValue {
  list: AnnotationSummary[];
  selectedId: string | null;
}

export interface AnnotationStateStore extends Readable<AnnotationStateValue> {
  setList(values: AnnotationSummary[]): void;
  setSelected(id: string | null): void;
  clearSelection(): void;
  clearSelectionIfMatches(id: string): void;
  reset(): void;
}

function ensureSelectedId(list: AnnotationSummary[], selectedId: string | null) {
  if (!selectedId) return null;
  return list.some((item) => item.id === selectedId) ? selectedId : null;
}

export function createAnnotationStateStore(): AnnotationStateStore {
  const { subscribe, update, set } = writable<AnnotationStateValue>({
    list: [],
    selectedId: null
  });

  return {
    subscribe,
    setList(values: AnnotationSummary[]) {
      update((state) => ({
        list: values,
        selectedId: ensureSelectedId(values, state.selectedId)
      }));
    },
    setSelected(id: string | null) {
      update((state) => ({
        ...state,
        selectedId: id
      }));
    },
    clearSelection() {
      update((state) => ({
        ...state,
        selectedId: null
      }));
    },
    clearSelectionIfMatches(id: string) {
      if (!id) return;
      update((state) => ({
        ...state,
        selectedId: state.selectedId === id ? null : state.selectedId
      }));
    },
    reset() {
      set({
        list: [],
        selectedId: null
      });
    }
  };
}
