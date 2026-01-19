/**
 * Creator module - map creation and editing UI components
 *
 * This module will contain extracted UI components from MapViewport.svelte:
 * - CreatorLeftPanel: Map selection, basemap controls
 * - CreatorRightPanel: Annotations, story scenes
 * - CreatorToolbar: Drawing tools, mode controls
 *
 * For now, it re-exports commonly used types and stores.
 */

// Re-export annotation management
export { getAnnotationContext, setAnnotationContext } from '$lib/map/context/annotationContext';

// Re-export story management
export {
	createStoryStore,
	createSceneId,
	clampStoryDelay,
	STORY_DELAY_MIN,
	STORY_DELAY_MAX,
	STORY_DEFAULT_DELAY
} from '$lib/map/story';
export type { StoryState, StoryStore } from '$lib/map/story';

// Re-export view mode management
export { createViewModeStore, normalizeViewMode } from '$lib/map/viewMode';
export type { ViewMode, ViewModeState, ViewModeStore } from '$lib/map/viewMode';

// Re-export search management
export { createSearchStore } from '$lib/map/search';
export type { SearchState, SearchStore } from '$lib/map/search';

// Re-export types
export type {
	DrawingMode,
	MapListItem,
	AnnotationSummary,
	StoryScene
} from '$lib/viewer/types';
