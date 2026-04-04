import type { SupabaseClient } from '@supabase/supabase-js';
import type { LabelTask, LabelPin, FootprintSubmission, PixelCoord, FeatureType, LegendItem } from '$lib/contribute/label/types';

interface DbLabelTask {
	id: string;
	map_id: string;
	allmaps_id: string;
	status: string;
	legend: LegendItem[] | null;
	categories: string[] | null;
	maps?: { name: string } | null;
}

interface DbLabelPin {
	id: string;
	task_id: string;
	user_id: string;
	label: string;
	pixel_x: number;
	pixel_y: number;
	confidence: number;
	data: Record<string, any> | null;
}

function toLabelTask(row: DbLabelTask): LabelTask {
	return {
		id: row.id,
		mapId: row.map_id,
		allmapsId: row.allmaps_id,
		status: row.status as LabelTask['status'],
		legend: Array.isArray(row.legend) ? row.legend : [],
		categories: Array.isArray(row.categories) ? row.categories : [],
		mapName: (row.maps as any)?.name ?? null,
	};
}

function toLabelPin(row: DbLabelPin): LabelPin {
	return {
		id: row.id,
		taskId: row.task_id,
		userId: row.user_id,
		label: row.label,
		pixelX: row.pixel_x,
		pixelY: row.pixel_y,
		confidence: row.confidence
	};
}

export async function fetchOpenTasks(supabase: SupabaseClient): Promise<LabelTask[]> {
	const { data, error } = await supabase
		.from('label_tasks')
		.select('*, maps(name)')
		.in('status', ['open', 'in_progress'])
		.order('created_at', { ascending: true });

	if (error || !data) {
		console.error('Failed to fetch label tasks:', error);
		return [];
	}

	return (data as unknown as DbLabelTask[]).map(toLabelTask);
}

export async function fetchTaskPins(
	supabase: SupabaseClient,
	taskId: string
): Promise<LabelPin[]> {
	const { data, error } = await supabase
		.from('label_pins')
		.select('*')
		.eq('task_id', taskId);

	if (error) throw new Error(error.message);
	return (data as unknown as DbLabelPin[]).map(toLabelPin);
}

export async function createPin(
	supabase: SupabaseClient,
	params: {
		taskId: string;
		userId: string;
		label: string;
		pixelX: number;
		pixelY: number;
		confidence: number;
		data?: Record<string, any>;
	}
): Promise<string | null> {
	const { data, error } = await supabase
		.from('label_pins')
		.insert({
			task_id: params.taskId,
			user_id: params.userId,
			label: params.label,
			pixel_x: params.pixelX,
			pixel_y: params.pixelY,
			confidence: params.confidence,
			data: params.data || {}
		} as never)
		.select('id')
		.single();

	if (error) {
		console.error('Failed to create label pin:', error);
		return null;
	}

	return (data as unknown as { id: string }).id;
}

export async function updatePinPosition(
	supabase: SupabaseClient,
	pinId: string,
	pixelX: number,
	pixelY: number
): Promise<boolean> {
	const { error } = await supabase
		.from('label_pins')
		.update({ pixel_x: pixelX, pixel_y: pixelY } as never)
		.eq('id', pinId);

	if (error) {
		console.error('Failed to update pin position:', error);
		return false;
	}
	return true;
}

export async function deletePin(
	supabase: SupabaseClient,
	pinId: string
): Promise<boolean> {
	const { error } = await supabase
		.from('label_pins')
		.delete()
		.eq('id', pinId);

	if (error) {
		console.error('Failed to delete label pin:', error);
		return false;
	}
	return true;
}

export async function updateTaskStatus(
	supabase: SupabaseClient,
	taskId: string,
	status: LabelTask['status']
): Promise<boolean> {
	const { error } = await supabase
		.from('label_tasks')
		.update({ status } as never)
		.eq('id', taskId);

	if (error) {
		console.error('Failed to update task status:', error);
		return false;
	}
	return true;
}

// ── Footprint submissions ──────────────────────────────────────────────────

interface DbFootprint {
	id: string;
	task_id: string;
	pin_id: string | null;
	user_id: string;
	pixel_polygon: PixelCoord[];
	name: string | null;
	category: string | null;
	feature_type: string;
	status: string;
}

function toFootprint(row: DbFootprint): FootprintSubmission {
	return {
		id: row.id,
		taskId: row.task_id,
		pinId: row.pin_id,
		userId: row.user_id,
		pixelPolygon: row.pixel_polygon,
		name: row.name,
		category: row.category,
		featureType: (row.feature_type ?? 'building') as FeatureType,
		status: row.status as FootprintSubmission['status']
	};
}

export async function fetchTaskFootprints(
	supabase: SupabaseClient,
	taskId: string
): Promise<FootprintSubmission[]> {
	const { data, error } = await supabase
		.from('footprint_submissions')
		.select('*')
		.eq('task_id', taskId);

	if (error) throw new Error(error.message);
	return (data as unknown as DbFootprint[]).map(toFootprint);
}

export async function createFootprint(
	supabase: SupabaseClient,
	params: {
		taskId: string;
		userId: string;
		pixelPolygon: PixelCoord[];
		pinId?: string | null;
		name?: string | null;
		category?: string | null;
		featureType?: FeatureType;
	}
): Promise<string | null> {
	const { data, error } = await supabase
		.from('footprint_submissions')
		.insert({
			task_id: params.taskId,
			user_id: params.userId,
			pixel_polygon: params.pixelPolygon,
			pin_id: params.pinId ?? null,
			name: params.name ?? null,
			category: params.category ?? null,
			feature_type: params.featureType ?? 'building'
		} as never)
		.select('id')
		.single();

	if (error) {
		console.error('Failed to create footprint:', error);
		return null;
	}
	return (data as unknown as { id: string }).id;
}

export interface SamFootprint {
	id: string;
	mapId: string;
	iiifCanvas: string;
	pixelPolygon: PixelCoord[];
	featureType: string;
	confidence: number | null;
	status: 'needs_review' | 'submitted' | 'rejected';
}

export async function fetchNeedsReviewFootprints(
	supabase: SupabaseClient,
	mapId: string
): Promise<SamFootprint[]> {
	const { data, error } = await supabase
		.from('footprint_submissions')
		.select('id, map_id, iiif_canvas, pixel_polygon, feature_type, confidence, status')
		.eq('map_id', mapId)
		.eq('status', 'needs_review')
		.order('confidence', { ascending: false });

	if (error) throw new Error(error.message);
	return ((data ?? []) as any[]).map((row) => ({
		id: row.id,
		mapId: row.map_id,
		iiifCanvas: row.iiif_canvas,
		pixelPolygon: row.pixel_polygon as PixelCoord[],
		featureType: row.feature_type ?? 'building',
		confidence: row.confidence,
		status: row.status
	}));
}

export async function fetchMapsWithPendingReview(
	supabase: SupabaseClient
): Promise<{ id: string; name: string; pendingCount: number }[]> {
	const { data, error } = await supabase
		.from('footprint_submissions')
		.select('map_id, maps(name)')
		.eq('status', 'needs_review');

	if (error) throw new Error(error.message);

	const counts = new Map<string, { name: string; count: number }>();
	for (const row of (data ?? []) as any[]) {
		const mid = row.map_id as string;
		const name = (row.maps as any)?.name ?? mid;
		const entry = counts.get(mid) ?? { name, count: 0 };
		entry.count++;
		counts.set(mid, entry);
	}

	return Array.from(counts.entries())
		.map(([id, { name, count }]) => ({ id, name, pendingCount: count }))
		.sort((a, b) => b.pendingCount - a.pendingCount);
}

export async function updateFootprint(
	supabase: SupabaseClient,
	footprintId: string,
	pixelPolygon: PixelCoord[]
): Promise<boolean> {
	const { error } = await supabase
		.from('footprint_submissions')
		.update({ pixel_polygon: pixelPolygon } as never)
		.eq('id', footprintId);
	if (error) { console.error('Failed to update footprint:', error); return false; }
	return true;
}

export async function updateFootprintMeta(
	supabase: SupabaseClient,
	footprintId: string,
	meta: { name?: string | null; featureType?: FeatureType; category?: string | null }
): Promise<boolean> {
	const update: Record<string, any> = {};
	if (meta.name !== undefined) update.name = meta.name;
	if (meta.featureType !== undefined) update.feature_type = meta.featureType;
	if (meta.category !== undefined) update.category = meta.category;
	const { error } = await supabase
		.from('footprint_submissions')
		.update(update as never)
		.eq('id', footprintId);
	if (error) { console.error('Failed to update footprint meta:', error); return false; }
	return true;
}

export async function deleteFootprint(
	supabase: SupabaseClient,
	footprintId: string
): Promise<boolean> {
	const { error } = await supabase
		.from('footprint_submissions')
		.delete()
		.eq('id', footprintId);

	if (error) {
		console.error('Failed to delete footprint:', error);
		return false;
	}
	return true;
}
