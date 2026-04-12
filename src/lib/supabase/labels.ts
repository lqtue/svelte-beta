import type { SupabaseClient } from '@supabase/supabase-js';
import type { LabelPin, FootprintSubmission, PixelCoord, FeatureType, LegendItem } from '$lib/contribute/label/types';

// ── Label Maps ────────────────────────────────────────────────────────────────

export interface LabelMapInfo {
	id: string;
	name: string;
	allmapsId: string;
	legend: LegendItem[];
	categories: string[];
}

export async function fetchLabelMaps(supabase: SupabaseClient): Promise<LabelMapInfo[]> {
	const { data, error } = await supabase
		.from('maps')
		.select('id, name, allmaps_id, label_config')
		.eq('georef_done', true)
		.order('priority', { ascending: false })
		.order('name');

	if (error) { console.error('Failed to fetch label maps:', error); return []; }

	return ((data ?? []) as any[])
		.filter((r: any) => r.allmaps_id)
		.map((r: any) => {
			const cfg = r.label_config ?? {};
			return {
				id:         r.id,
				name:       r.name,
				allmapsId:  r.allmaps_id,
				legend:     Array.isArray(cfg.legend)     ? cfg.legend     : [],
				categories: Array.isArray(cfg.categories) ? cfg.categories : [],
			};
		});
}

// ── Label Pins ────────────────────────────────────────────────────────────────

interface DbLabelPin {
	id: string;
	map_id: string;
	user_id: string;
	label: string;
	pixel_x: number;
	pixel_y: number;
	data: Record<string, any> | null;
}

function toLabelPin(row: DbLabelPin): LabelPin {
	return {
		id: row.id,
		mapId: row.map_id,
		userId: row.user_id,
		label: row.label,
		pixelX: row.pixel_x,
		pixelY: row.pixel_y,
		data: row.data ?? undefined
	};
}

export async function fetchMapPins(
	supabase: SupabaseClient,
	mapId: string
): Promise<LabelPin[]> {
	const { data, error } = await supabase
		.from('label_pins')
		.select('*')
		.eq('map_id', mapId)
		.order('created_at', { ascending: true });

	if (error) throw new Error(error.message);
	return (data as unknown as DbLabelPin[]).map(toLabelPin);
}

export async function createPin(
	supabase: SupabaseClient,
	params: {
		mapId: string;
		userId: string;
		label: string;
		pixelX: number;
		pixelY: number;
		data?: Record<string, any>;
	}
): Promise<string | null> {
	const { data, error } = await supabase
		.from('label_pins')
		.insert({
			map_id:  params.mapId,
			user_id: params.userId,
			label:   params.label,
			pixel_x: params.pixelX,
			pixel_y: params.pixelY,
			data:    params.data || {}
		} as never)
		.select('id')
		.single();

	if (error) {
		console.error('Failed to create pin:', error);
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

	if (error) { console.error('Failed to update pin:', error); return false; }
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

	if (error) { console.error('Failed to delete pin:', error); return false; }
	return true;
}

// ── Footprint Submissions ─────────────────────────────────────────────────────

interface DbFootprint {
	id: string;
	map_id: string;
	user_id: string;
	pixel_polygon: PixelCoord[];
	name: string | null;
	category: string | null;
	feature_type: string;
	status: string;
}

function toFootprint(row: DbFootprint): FootprintSubmission {
	return {
		id:           row.id,
		mapId:        row.map_id,
		userId:       row.user_id,
		pixelPolygon: row.pixel_polygon,
		name:         row.name,
		category:     row.category,
		featureType:  (row.feature_type ?? 'building') as FeatureType,
		status:       row.status as FootprintSubmission['status']
	};
}

export async function fetchMapFootprints(
	supabase: SupabaseClient,
	mapId: string
): Promise<FootprintSubmission[]> {
	const { data, error } = await supabase
		.from('footprint_submissions')
		.select('id, map_id, user_id, pixel_polygon, name, category, feature_type, status')
		.eq('map_id', mapId)
		.order('created_at', { ascending: true });

	if (error) throw new Error(error.message);
	return (data as unknown as DbFootprint[]).map(toFootprint);
}

export async function createFootprint(
	supabase: SupabaseClient,
	params: {
		mapId: string;
		userId: string;
		pixelPolygon: PixelCoord[];
		name?: string | null;
		category?: string | null;
		featureType?: FeatureType;
	}
): Promise<string | null> {
	const { data, error } = await supabase
		.from('footprint_submissions')
		.insert({
			map_id:        params.mapId,
			user_id:       params.userId,
			pixel_polygon: params.pixelPolygon,
			name:          params.name    ?? null,
			category:      params.category ?? null,
			feature_type:  params.featureType ?? 'building',
			status:        'submitted',
			source:        'manual'
		} as never)
		.select('id')
		.single();

	if (error) { console.error('Failed to create footprint:', error); return null; }
	return (data as unknown as { id: string }).id;
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
	const update: Record<string, unknown> = {};
	if (meta.name !== undefined)        update.name         = meta.name;
	if (meta.featureType !== undefined) update.feature_type = meta.featureType;
	if (meta.category !== undefined)    update.category     = meta.category;

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
	if (error) { console.error('Failed to delete footprint:', error); return false; }
	return true;
}

// ── Review helpers ────────────────────────────────────────────────────────────

// SamFootprint = FootprintSubmission; kept for backward compat with ReviewMode/ReviewCanvas/ReviewSidebar
export type SamFootprint = FootprintSubmission;

export async function fetchSubmittedFootprints(
	supabase: SupabaseClient,
	mapId: string
): Promise<SamFootprint[]> {
	const { data, error } = await supabase
		.from('footprint_submissions')
		.select('id, map_id, user_id, pixel_polygon, name, category, feature_type, status')
		.eq('map_id', mapId)
		.eq('status', 'submitted')
		.order('created_at', { ascending: true });

	if (error) throw new Error(error.message);
	return (data as unknown as DbFootprint[]).map(toFootprint);
}

export async function fetchMapsWithSubmittedFootprints(
	supabase: SupabaseClient
): Promise<{ id: string; name: string; allmapsId: string; pendingCount: number }[]> {
	const { data, error } = await supabase
		.from('footprint_submissions')
		.select('map_id, maps!inner(id, name, allmaps_id)')
		.eq('status', 'submitted');

	if (error) throw new Error(error.message);

	const counts: Record<string, { id: string; name: string; allmapsId: string; count: number }> = {};
	for (const row of (data ?? []) as any[]) {
		const mapRow = row.maps;
		if (!mapRow) continue;
		const mid = mapRow.id as string;
		if (!counts[mid]) counts[mid] = { id: mid, name: mapRow.name ?? mid, allmapsId: mapRow.allmaps_id ?? '', count: 0 };
		counts[mid].count++;
	}
	return Object.values(counts).map(c => ({ id: c.id, name: c.name, allmapsId: c.allmapsId, pendingCount: c.count }));
}
