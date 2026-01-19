/**
 * Annotations module - annotation management and UI
 *
 * Re-exports from existing stores and adds additional utilities
 */

// Re-export from existing stores
export { createAnnotationStateStore } from '../stores/annotationState';
export type { AnnotationStateStore } from '../stores/annotationState';

export {
	createAnnotationHistoryStore,
	captureFeatureSnapshot,
	restoreFeatureFromSnapshot
} from '../stores/annotationHistory';
export type {
	AnnotationHistoryStore,
	AnnotationHistoryState,
	HistoryEntry,
	FeatureSnapshot,
	AnnotationField
} from '../stores/annotationHistory';

// Re-export annotation utilities
export {
	randomId,
	ensureAnnotationDefaults,
	toAnnotationSummary,
	createAnnotationStyle,
	hexToRgba,
	searchResultStyle
} from '$lib/viewer/annotations';

// Re-export types
export type { AnnotationSummary } from '$lib/viewer/types';
