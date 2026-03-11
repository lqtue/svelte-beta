import type { SupabaseClient } from '@supabase/supabase-js';
import type { LabelTask, LabelPin, FootprintSubmission, PixelCoord, FeatureType } from '$lib/contribute/label/types';

interface DbLabelTask {
	id: string;
	map_id: string;
	allmaps_id: string;
	region: object;
	status: string;
	legend: string[] | null;
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
		region: row.region as LabelTask['region'],
		status: row.status as LabelTask['status'],
		legend: Array.isArray(row.legend) ? row.legend : []
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
		.select('*')
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
	label: string | null;
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
		label: row.label,
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
		label?: string | null;
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
			label: params.label ?? null,
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
