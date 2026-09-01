import { setContext, getContext } from 'svelte';
import type { AnnotationHistoryStore } from '$lib/map/annotations/annotationHistory';
import type { AnnotationStateStore } from '$lib/map/annotations/annotationState';

const ANNOTATION_CONTEXT_KEY = Symbol('annotation-context');

/**
 * Registers the annotation stores on the Svelte context so child components
 * can access them without prop drilling.
 *
 * Example:
 *
 * ```svelte
 * <script lang="ts">
 *   import { getAnnotationContext } from '$lib/map/annotations/annotationContext';
 *   const { state } = getAnnotationContext();
 *   $: selectedId = $state.selectedId;
 * </script>
 * ```
 */

export interface AnnotationContextValue {
  history: AnnotationHistoryStore;
  state: AnnotationStateStore;
}

export function setAnnotationContext(value: AnnotationContextValue): void {
  setContext(ANNOTATION_CONTEXT_KEY, value);
}

export function getAnnotationContext(): AnnotationContextValue {
  const context = getContext<AnnotationContextValue>(ANNOTATION_CONTEXT_KEY);
  if (!context) {
    throw new Error('Annotation context is not available — call setAnnotationContext first.');
  }
  return context;
}
