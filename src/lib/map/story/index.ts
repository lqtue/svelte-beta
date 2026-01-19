/**
 * Story module - scene-based map narratives
 */

export {
	createStoryStore,
	createSceneId,
	clampStoryDelay,
	createVisibleScenesStore,
	findFirstVisibleIndex,
	findNextVisibleIndex,
	STORY_DELAY_MIN,
	STORY_DELAY_MAX,
	STORY_DEFAULT_DELAY
} from './storyStore';
export type {
	StoryState,
	StoryStore
} from './storyStore';

export {
	createAutoplayController,
	StoryAutoplayTimer
} from './storyAutoplay';
export type {
	AutoplayController,
	AutoplayOptions
} from './storyAutoplay';
