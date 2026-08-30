import type { SupabaseClient } from '@supabase/supabase-js';
import type { Story, StoryPoint } from '$lib/story/types';

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
		createdAt: new Date(row.created_at).getTime(),
		updatedAt: new Date(row.updated_at).getTime(),
	};
}

// ─── Public API ──────────────────────────────────────────────────────────────


export async function fetchStoryById(supabase: SupabaseClient, id: string): Promise<Story | null> {
	const { data, error } = await supabase
		.from('stories')
		.select('*, story_points(*)')
		.eq('id', id)
		.single();
	if (error || !data) { console.error('fetchStoryById:', error); return null; }
	return rowToStory(data);
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

/**
 * Push the full local draft (story row + every point) to Supabase, then return.
 * Used by /create's Publish toggle: local drafts only live in localStorage, so
 * before flipping `is_public` we have to make sure the row actually exists.
 *
 * Strategy: upsert the story row by id, then replace all child story_points
 * (delete + insert). Atomic enough for a single user editing one draft at a time.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function syncStoryToSupabase(
	supabase: SupabaseClient,
	story: Story,
	userId: string
): Promise<boolean> {
	const { error: storyErr } = await supabase.from('stories').upsert({
		id: story.id,
		user_id: userId,
		title: story.title,
		description: story.description || null,
		mode: story.mode ?? 'guided',
		region: story.region ?? {},
		is_public: story.isPublic
	});
	if (storyErr) { console.error('syncStoryToSupabase (story):', storyErr); return false; }

	const { error: delErr } = await supabase
		.from('story_points')
		.delete()
		.eq('story_id', story.id);
	if (delErr) { console.error('syncStoryToSupabase (delete points):', delErr); return false; }

	if (story.points.length > 0) {
		const rows = story.points.map((p, i) => ({
			story_id: story.id,
			sort_order: i,
			title: p.title || `Point ${i + 1}`,
			description: p.description || null,
			hint: p.hint || null,
			quest: p.quest || null,
			lon: p.coordinates[0],
			lat: p.coordinates[1],
			trigger_radius: p.triggerRadius ?? 10,
			interaction: p.interaction ?? 'proximity',
			challenge: p.challenge ?? { type: 'none' },
			qr_payload: p.qrPayload || null,
			// Schema FKs to maps(id); a legacy allmaps_id (16-hex) would violate the FK.
			overlay_map_id: p.overlayMapId && UUID_RE.test(p.overlayMapId) ? p.overlayMapId : null,
			camera: p.camera ?? {}
		}));
		const { error: insErr } = await supabase.from('story_points').insert(rows);
		if (insErr) { console.error('syncStoryToSupabase (insert points):', insErr); return false; }
	}

	return true;
}

