/**
 * Viewer components module - dialogs and overlays
 *
 * This module will contain extracted UI components:
 * - MetadataDialog: Map metadata display
 * - ShareDialog: Share link generation
 *
 * For now, it re-exports commonly used utilities.
 */

// Re-export annotation utilities
export {
	ensureAnnotationDefaults,
	toAnnotationSummary,
	createAnnotationStyle,
	hexToRgba,
	searchResultStyle
} from '$lib/viewer/annotations';

// Re-export constants
export {
	DATASET_URL,
	DEFAULT_ANNOTATION_COLOR,
	APP_STATE_KEY,
	DRAW_TYPE_MAP,
	BASEMAP_DEFS,
	INITIAL_CENTER
} from '$lib/viewer/constants';

// Re-export types
export type {
	ViewMode,
	DrawingMode,
	MapListItem,
	AnnotationSummary,
	SearchResult,
	PersistedAppState,
	StoryScene
} from '$lib/viewer/types';
