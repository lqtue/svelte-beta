import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import type { Story, StoryPoint, StoryProgress } from '$lib/story/types';

type DbHunt = Database['public']['Tables']['hunts']['Row'];
type DbHuntInsert = Database['public']['Tables']['hunts']['Insert'];
type DbStop = Database['public']['Tables']['hunt_stops']['Row'];
type DbStopInsert = Database['public']['Tables']['hunt_stops']['Insert'];
type DbProgress = Database['public']['Tables']['hunt_progress']['Row'];

function dbStopToStoryPoint(row: DbStop): StoryPoint {
	return {
		id: row.id,
		order: row.sort_order,
		title: row.title,
		description: row.description || '',
		hint: row.hint || undefined,
		quest: row.quest || undefined,
		coordinates: [row.lon, row.lat],
		triggerRadius: row.trigger_radius,
		interaction: row.interaction as StoryPoint['interaction'],
		challenge: { type: 'reach', triggerRadius: row.trigger_radius },
		qrPayload: row.qr_payload || undefined,
		overlayMapId: row.overlay_map_id || undefined
	};
}

function dbHuntToStory(hunt: DbHunt, stops: DbStop[]): Story {
	const points = stops
		.filter((s) => s.hunt_id === hunt.id)
		.sort((a, b) => a.sort_order - b.sort_order)
		.map(dbStopToStoryPoint);
	return {
		id: hunt.id,
		title: hunt.title,
		description: hunt.description || '',
		mode: 'guided',
		points,
		stops: points,
		region: hunt.region as Story['region'],
		createdAt: new Date(hunt.created_at).getTime(),
		updatedAt: new Date(hunt.updated_at).getTime(),
		isPublic: hunt.is_public,
		authorId: hunt.user_id
	};
}

function asHunts(data: unknown): DbHunt[] {
	return data as DbHunt[];
}

function asStops(data: unknown): DbStop[] {
	return data as DbStop[];
}

function asProgress(data: unknown): DbProgress[] {
	return data as DbProgress[];
}

export async function fetchUserStories(
	supabase: SupabaseClient<Database>,
	userId: string
): Promise<Story[]> {
	const { data: hunts, error: huntsError } = await supabase
		.from('hunts')
		.select('*')
		.eq('user_id', userId)
		.order('updated_at', { ascending: false });

	if (huntsError || !hunts) {
		console.error('Failed to fetch stories:', huntsError);
		return [];
	}

	const typedHunts = asHunts(hunts);
	if (typedHunts.length === 0) return [];

	const huntIds = typedHunts.map((h) => h.id);
	const { data: stops, error: stopsError } = await supabase
		.from('hunt_stops')
		.select('*')
		.in('hunt_id', huntIds)
		.order('sort_order');

	if (stopsError) {
		console.error('Failed to fetch story points:', stopsError);
	}

	return typedHunts.map((hunt) => dbHuntToStory(hunt, asStops(stops || [])));
}

export async function fetchPublicStories(
	supabase: SupabaseClient<Database>
): Promise<Story[]> {
	const { data: hunts, error: huntsError } = await supabase
		.from('hunts')
		.select('*')
		.eq('is_public', true)
		.order('updated_at', { ascending: false });

	if (huntsError || !hunts) {
		console.error('Failed to fetch public stories:', huntsError);
		return [];
	}

	const typedHunts = asHunts(hunts);
	if (typedHunts.length === 0) return [];

	const huntIds = typedHunts.map((h) => h.id);
	const { data: stops } = await supabase
		.from('hunt_stops')
		.select('*')
		.in('hunt_id', huntIds)
		.order('sort_order');

	return typedHunts.map((hunt) => dbHuntToStory(hunt, asStops(stops || [])));
}

export async function createStory(
	supabase: SupabaseClient<Database>,
	userId: string,
	story: { title: string; description?: string; region?: Story['region'] }
): Promise<string | null> {
	const insertData: DbHuntInsert = {
		user_id: userId,
		title: story.title,
		description: story.description || null,
		region: story.region || null
	};

	const { data, error } = await supabase
		.from('hunts')
		.insert(insertData as never)
		.select('id')
		.single();

	if (error) {
		console.error('Failed to create story:', error);
		return null;
	}

	return (data as unknown as { id: string }).id;
}

export async function updateStory(
	supabase: SupabaseClient<Database>,
	storyId: string,
	updates: {
		title?: string;
		description?: string;
		region?: Story['region'];
		is_public?: boolean;
		mode?: string;
	}
): Promise<boolean> {
	const { error } = await supabase
		.from('hunts')
		.update({ ...updates, updated_at: new Date().toISOString() } as never)
		.eq('id', storyId);

	if (error) {
		console.error('Failed to update story:', error);
		return false;
	}
	return true;
}

export async function deleteStory(
	supabase: SupabaseClient<Database>,
	storyId: string
): Promise<boolean> {
	const { error } = await supabase.from('hunts').delete().eq('id', storyId);

	if (error) {
		console.error('Failed to delete story:', error);
		return false;
	}
	return true;
}

export async function addStop(
	supabase: SupabaseClient<Database>,
	storyId: string,
	stop: { title: string; coordinates: [number, number]; sortOrder: number }
): Promise<string | null> {
	const insertData: DbStopInsert = {
		hunt_id: storyId,
		sort_order: stop.sortOrder,
		title: stop.title,
		lon: stop.coordinates[0],
		lat: stop.coordinates[1]
	};

	const { data, error } = await supabase
		.from('hunt_stops')
		.insert(insertData as never)
		.select('id')
		.single();

	if (error) {
		console.error('Failed to add point:', error);
		return null;
	}

	await supabase
		.from('hunts')
		.update({ updated_at: new Date().toISOString() } as never)
		.eq('id', storyId);

	return (data as unknown as { id: string }).id;
}

export async function updateStop(
	supabase: SupabaseClient<Database>,
	stopId: string,
	updates: Partial<{
		title: string;
		description: string;
		hint: string;
		quest: string;
		lon: number;
		lat: number;
		sort_order: number;
		trigger_radius: number;
		interaction: string;
		qr_payload: string;
		overlay_map_id: string;
	}>
): Promise<boolean> {
	const { error } = await supabase
		.from('hunt_stops')
		.update(updates as never)
		.eq('id', stopId);

	if (error) {
		console.error('Failed to update point:', error);
		return false;
	}
	return true;
}

export async function removeStop(
	supabase: SupabaseClient<Database>,
	stopId: string
): Promise<boolean> {
	const { error } = await supabase.from('hunt_stops').delete().eq('id', stopId);

	if (error) {
		console.error('Failed to remove point:', error);
		return false;
	}
	return true;
}

export async function upsertProgress(
	supabase: SupabaseClient<Database>,
	userId: string,
	storyId: string,
	progress: Partial<{
		current_stop_index: number;
		completed_stops: string[];
		completed_at: string | null;
	}>
): Promise<boolean> {
	const { error } = await supabase.from('hunt_progress').upsert(
		{
			user_id: userId,
			hunt_id: storyId,
			...progress
		} as never,
		{ onConflict: 'user_id,hunt_id' }
	);

	if (error) {
		console.error('Failed to upsert progress:', error);
		return false;
	}
	return true;
}

export async function fetchProgress(
	supabase: SupabaseClient<Database>,
	userId: string,
	storyId: string
): Promise<StoryProgress | null> {
	const { data, error } = await supabase
		.from('hunt_progress')
		.select('*')
		.eq('user_id', userId)
		.eq('hunt_id', storyId)
		.single();

	if (error || !data) return null;

	const row = data as unknown as DbProgress;
	return {
		storyId: row.hunt_id,
		huntId: row.hunt_id,
		currentPointIndex: row.current_stop_index,
		currentStopIndex: row.current_stop_index,
		completedPoints: row.completed_stops,
		completedStops: row.completed_stops,
		startedAt: new Date(row.started_at).getTime(),
		completedAt: row.completed_at ? new Date(row.completed_at).getTime() : undefined
	};
}

export async function fetchAllProgress(
	supabase: SupabaseClient<Database>,
	userId: string
): Promise<Record<string, StoryProgress>> {
	const { data, error } = await supabase
		.from('hunt_progress')
		.select('*')
		.eq('user_id', userId);

	if (error || !data) return {};

	const rows = asProgress(data);
	const result: Record<string, StoryProgress> = {};
	for (const row of rows) {
		result[row.hunt_id] = {
			storyId: row.hunt_id,
			huntId: row.hunt_id,
			currentPointIndex: row.current_stop_index,
			currentStopIndex: row.current_stop_index,
			completedPoints: row.completed_stops,
			completedStops: row.completed_stops,
			startedAt: new Date(row.started_at).getTime(),
			completedAt: row.completed_at ? new Date(row.completed_at).getTime() : undefined
		};
	}
	return result;
}

// Legacy aliases
export const fetchUserHunts = fetchUserStories;
export const fetchPublicHunts = fetchPublicStories;
export const createHunt = createStory;
export const updateHunt = updateStory;
export const deleteHunt = deleteStory;
