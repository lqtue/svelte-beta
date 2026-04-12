// Story/hunt tables have been dropped (migration 034).
// These are stubs so callers compile and degrade gracefully (return empty).
// The story system will be rebuilt with a cleaner schema.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Story, StoryPoint, StoryProgress } from '$lib/story/types';

export async function fetchUserStories(
	_supabase: SupabaseClient,
	_userId: string
): Promise<Story[]> {
	return [];
}

export async function fetchPublicStories(
	_supabase: SupabaseClient,
	_mapId?: string
): Promise<Story[]> {
	return [];
}

export async function createStory(
	_supabase: SupabaseClient,
	_userId: string,
	_data: { title: string; description?: string }
): Promise<Story | null> {
	return null;
}

export async function updateStory(
	_supabase: SupabaseClient,
	_storyId: string,
	_data: Partial<Pick<Story, 'title' | 'description' | 'isPublic' | 'region'>>
): Promise<boolean> {
	return false;
}

export async function deleteStory(
	_supabase: SupabaseClient,
	_storyId: string
): Promise<boolean> {
	return false;
}

export async function publishStory(
	_supabase: SupabaseClient,
	_storyId: string
): Promise<boolean> {
	return false;
}

export async function unpublishStory(
	_supabase: SupabaseClient,
	_storyId: string
): Promise<boolean> {
	return false;
}

export async function addStoryPoint(
	_supabase: SupabaseClient,
	_storyId: string,
	_point: Omit<StoryPoint, 'id'>
): Promise<StoryPoint | null> {
	return null;
}

export async function updateStoryPoint(
	_supabase: SupabaseClient,
	_pointId: string,
	_data: Partial<StoryPoint>
): Promise<boolean> {
	return false;
}

export async function deleteStoryPoint(
	_supabase: SupabaseClient,
	_pointId: string
): Promise<boolean> {
	return false;
}

export async function saveStoryProgress(
	_supabase: SupabaseClient,
	_progress: StoryProgress
): Promise<boolean> {
	return false;
}

export async function fetchStoryProgress(
	_supabase: SupabaseClient,
	_userId: string,
	_storyId: string
): Promise<StoryProgress | null> {
	return null;
}

export async function fetchAllProgress(
	_supabase: SupabaseClient,
	_userId: string
): Promise<Record<string, StoryProgress>> {
	return {};
}

// Legacy alias
export const fetchPublicHunts = fetchPublicStories;
