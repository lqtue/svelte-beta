import type { SupabaseClient } from '@supabase/supabase-js';
import type { Story, StoryPoint, StoryProgress } from '$lib/story/types';

// ─── Row → Type mappers ──────────────────────────────────────────────────────

function rowToPoint(row: any): StoryPoint {
	return {
		id: row.id,
		order: row.sort_order,
		title: row.title,
		description: row.description ?? '',
		hint: row.hint ?? undefined,
		quest: row.quest ?? undefined,
		coordinates: [row.lon, row.lat],
		triggerRadius: row.trigger_radius,
		interaction: row.interaction,
		challenge: row.challenge ?? { type: 'none' },
		qrPayload: row.qr_payload ?? undefined,
		overlayMapId: row.overlay_map_id ?? undefined,
		camera: row.camera && Object.keys(row.camera).length ? row.camera : undefined,
	};
}

function rowToStory(row: any): Story {
	const points: StoryPoint[] = (row.story_points ?? [])
		.slice()
		.sort((a: any, b: any) => a.sort_order - b.sort_order)
		.map(rowToPoint);

	return {
		id: row.id,
		authorId: row.user_id,
		title: row.title,
		description: row.description ?? '',
		mode: row.mode,
		region: row.region && Object.keys(row.region).length ? row.region : undefined,
		isPublic: row.is_public,
		points,
		stops: points, // legacy alias
		createdAt: new Date(row.created_at).getTime(),
		updatedAt: new Date(row.updated_at).getTime(),
	};
}

function rowToProgress(row: any): StoryProgress {
	return {
		storyId: row.story_id,
		huntId: row.story_id, // legacy alias
		currentPointIndex: row.current_point_index,
		currentStopIndex: row.current_point_index, // legacy alias
		completedPoints: row.completed_points ?? [],
		completedStops: row.completed_points ?? [], // legacy alias
		startedAt: new Date(row.started_at).getTime(),
		completedAt: row.completed_at ? new Date(row.completed_at).getTime() : undefined,
	};
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchUserStories(
	supabase: SupabaseClient,
	userId: string
): Promise<Story[]> {
	const { data, error } = await supabase
		.from('stories')
		.select('*, story_points(*)')
		.eq('user_id', userId)
		.order('updated_at', { ascending: false });

	if (error) { console.error('fetchUserStories:', error); return []; }
	return (data ?? []).map(rowToStory);
}

export async function fetchPublicStories(
	supabase: SupabaseClient,
	_mapId?: string
): Promise<Story[]> {
	const { data, error } = await supabase
		.from('stories')
		.select('*, story_points(*)')
		.eq('is_public', true)
		.order('updated_at', { ascending: false });

	if (error) { console.error('fetchPublicStories:', error); return []; }
	return (data ?? []).map(rowToStory);
}

export async function createStory(
	supabase: SupabaseClient,
	userId: string,
	data: { title: string; description?: string; mode?: 'guided' | 'adventure' }
): Promise<Story | null> {
	const { data: row, error } = await supabase
		.from('stories')
		.insert({
			user_id: userId,
			title: data.title,
			description: data.description ?? null,
			mode: data.mode ?? 'guided',
		})
		.select('*, story_points(*)')
		.single();

	if (error) { console.error('createStory:', error); return null; }
	return rowToStory(row);
}

export async function updateStory(
	supabase: SupabaseClient,
	storyId: string,
	data: Partial<Pick<Story, 'title' | 'description' | 'isPublic' | 'region'>>
): Promise<boolean> {
	const patch: Record<string, unknown> = {};
	if (data.title !== undefined)       patch.title       = data.title;
	if (data.description !== undefined) patch.description = data.description;
	if (data.isPublic !== undefined)    patch.is_public   = data.isPublic;
	if (data.region !== undefined)      patch.region      = data.region ?? {};

	const { error } = await supabase
		.from('stories')
		.update(patch)
		.eq('id', storyId);

	if (error) { console.error('updateStory:', error); return false; }
	return true;
}

export async function deleteStory(
	supabase: SupabaseClient,
	storyId: string
): Promise<boolean> {
	const { error } = await supabase
		.from('stories')
		.delete()
		.eq('id', storyId);

	if (error) { console.error('deleteStory:', error); return false; }
	return true;
}

export async function publishStory(
	supabase: SupabaseClient,
	storyId: string
): Promise<boolean> {
	return updateStory(supabase, storyId, { isPublic: true });
}

export async function unpublishStory(
	supabase: SupabaseClient,
	storyId: string
): Promise<boolean> {
	return updateStory(supabase, storyId, { isPublic: false });
}

export async function addStoryPoint(
	supabase: SupabaseClient,
	storyId: string,
	point: Omit<StoryPoint, 'id'>
): Promise<StoryPoint | null> {
	const { data: row, error } = await supabase
		.from('story_points')
		.insert({
			story_id: storyId,
			sort_order: point.order,
			title: point.title,
			description: point.description ?? null,
			hint: point.hint ?? null,
			quest: point.quest ?? null,
			lon: point.coordinates[0],
			lat: point.coordinates[1],
			trigger_radius: point.triggerRadius,
			interaction: point.interaction,
			challenge: point.challenge ?? { type: 'none' },
			qr_payload: point.qrPayload ?? null,
			overlay_map_id: point.overlayMapId ?? null,
			camera: point.camera ?? {},
		})
		.select()
		.single();

	if (error) { console.error('addStoryPoint:', error); return null; }
	return rowToPoint(row);
}

export async function updateStoryPoint(
	supabase: SupabaseClient,
	pointId: string,
	data: Partial<StoryPoint>
): Promise<boolean> {
	const patch: Record<string, unknown> = {};
	if (data.order !== undefined)       patch.sort_order     = data.order;
	if (data.title !== undefined)       patch.title          = data.title;
	if (data.description !== undefined) patch.description    = data.description;
	if (data.hint !== undefined)        patch.hint           = data.hint ?? null;
	if (data.quest !== undefined)       patch.quest          = data.quest ?? null;
	if (data.coordinates !== undefined) {
		patch.lon = data.coordinates[0];
		patch.lat = data.coordinates[1];
	}
	if (data.triggerRadius !== undefined) patch.trigger_radius = data.triggerRadius;
	if (data.interaction !== undefined)   patch.interaction    = data.interaction;
	if (data.challenge !== undefined)     patch.challenge      = data.challenge;
	if (data.qrPayload !== undefined)     patch.qr_payload     = data.qrPayload ?? null;
	if (data.overlayMapId !== undefined)  patch.overlay_map_id = data.overlayMapId ?? null;
	if (data.camera !== undefined)        patch.camera         = data.camera ?? {};

	const { error } = await supabase
		.from('story_points')
		.update(patch)
		.eq('id', pointId);

	if (error) { console.error('updateStoryPoint:', error); return false; }
	return true;
}

export async function deleteStoryPoint(
	supabase: SupabaseClient,
	pointId: string
): Promise<boolean> {
	const { error } = await supabase
		.from('story_points')
		.delete()
		.eq('id', pointId);

	if (error) { console.error('deleteStoryPoint:', error); return false; }
	return true;
}

export async function saveStoryProgress(
	supabase: SupabaseClient,
	progress: StoryProgress
): Promise<boolean> {
	const { error } = await supabase
		.from('story_progress')
		.upsert(
			{
				story_id: progress.storyId,
				user_id: (supabase.auth as any)._currentSession?.user?.id ?? '',
				current_point_index: progress.currentPointIndex,
				completed_points: progress.completedPoints,
				completed_at: progress.completedAt
					? new Date(progress.completedAt).toISOString()
					: null,
			},
			{ onConflict: 'story_id,user_id' }
		);

	if (error) { console.error('saveStoryProgress:', error); return false; }
	return true;
}

export async function fetchStoryProgress(
	supabase: SupabaseClient,
	_userId: string,
	storyId: string
): Promise<StoryProgress | null> {
	const { data: row, error } = await supabase
		.from('story_progress')
		.select('*')
		.eq('story_id', storyId)
		.single();

	if (error || !row) return null;
	return rowToProgress(row);
}

export async function fetchAllProgress(
	supabase: SupabaseClient,
	_userId: string
): Promise<Record<string, StoryProgress>> {
	const { data, error } = await supabase
		.from('story_progress')
		.select('*');

	if (error || !data) return {};
	return Object.fromEntries(data.map((row: any) => [row.story_id, rowToProgress(row)]));
}

// Legacy alias
export const fetchPublicHunts = fetchPublicStories;
