/**
 * Map module - OpenLayers map components and utilities
 *
 * This module provides extracted functionality from the MapViewport component:
 * - viewMode: View mode management (overlay, side-by-side, spy glass)
 * - search: Location search with Nominatim
 * - story: Scene-based map narratives
 * - overlay: Warped map layer management
 * - annotations: Annotation state and history
 */

// View Mode
export {
	createViewModeStore,
	normalizeViewMode,
	getClipPath,
	applyClipMask,
	clearClipMask,
	getVerticalDividerPosition,
	getHorizontalDividerPosition,
	getLensPosition,
	getMaxLensRadius,
	clampLensRadius
} from './viewMode';
export type {
	ViewMode,
	ViewModeState,
	ViewModeStore,
	ClipMaskParams,
	DividerPosition,
	LensPosition
} from './viewMode';

// Search
export {
	createSearchStore,
	searchNominatim,
	createDebouncedSearch
} from './search';
export type {
	SearchState,
	SearchStore,
	SearchNoticeType,
	NominatimSearchOptions
} from './search';

// Story
export {
	createStoryStore,
	createSceneId,
	clampStoryDelay,
	createVisibleScenesStore,
	findFirstVisibleIndex,
	findNextVisibleIndex,
	createAutoplayController,
	StoryAutoplayTimer,
	STORY_DELAY_MIN,
	STORY_DELAY_MAX,
	STORY_DEFAULT_DELAY
} from './story';
export type {
	StoryState,
	StoryStore,
	AutoplayController,
	AutoplayOptions
} from './story';

// Overlay
export {
	createOverlayStore,
	createOverlayCache
} from './overlay';
export type {
	OverlayState,
	OverlayStore,
	OverlayCache
} from './overlay';

// Annotations (re-exports from stores)
export {
	createAnnotationStateStore,
	createAnnotationHistoryStore,
	captureFeatureSnapshot,
	restoreFeatureFromSnapshot
} from './annotations';
export type {
	AnnotationStateStore
} from './stores/annotationState';
export type {
	AnnotationHistoryStore,
	AnnotationHistoryState,
	HistoryEntry,
	FeatureSnapshot,
	AnnotationField
} from './stores/annotationHistory';

// Context
export { getAnnotationContext, setAnnotationContext } from './context/annotationContext';
