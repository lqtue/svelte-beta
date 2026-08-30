import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import type { FootprintSubmission, PixelCoord, FeatureType, LegendItem } from '$lib/data/maps/footprintTypes';

type Json = Database['public']['Tables']['footprint_submissions']['Row']['pixel_polygon'];
type FootprintUpdate = Database['public']['Tables']['footprint_submissions']['Update'];

type LabelMapRow = Pick<
	Database['public']['Tables']['maps']['Row'],
	'id' | 'name' | 'allmaps_id' | 'iiif_image' | 'label_config'
>;

// ── Label Maps ────────────────────────────────────────────────────────────────

export interface LabelMapInfo {
	id: string;
	name: string;
	allmapsId: string;
	iiifImage?: string;
	legend: LegendItem[];
	categories: string[];
}

export async function fetchLabelMaps(supabase: SupabaseClient<Database>): Promise<LabelMapInfo[]> {
	const { data, error } = await supabase
		.from('maps')
		.select('id, name, allmaps_id, iiif_image, label_config')
		.eq('georef_done', true)
		.order('priority', { ascending: false })
		.order('name');

	if (error) { console.error('Failed to fetch label maps:', error); return []; }

	return ((data ?? []) as LabelMapRow[])
		.filter((r) => r.allmaps_id)
		.map((r) => {
			const cfg = (r.label_config ?? {}) as { legend?: LegendItem[]; categories?: string[] };
			return {
				id:         r.id,
				name:       r.name,
				allmapsId:  r.allmaps_id!,
				iiifImage:  r.iiif_image ?? undefined,
				legend:     Array.isArray(cfg.legend)     ? cfg.legend     : [],
				categories: Array.isArray(cfg.categories) ? cfg.categories : [],
			};
		});
}

// ── Footprint Submissions ─────────────────────────────────────────────────────

type DbFootprint = Pick<
	Database['public']['Tables']['footprint_submissions']['Row'],
	'id' | 'map_id' | 'user_id' | 'pixel_polygon' | 'name' | 'category' | 'feature_type' | 'status'
>;

function toFootprint(row: DbFootprint): FootprintSubmission {
	return {
		id:           row.id,
		mapId:        row.map_id ?? '',
		userId:       row.user_id ?? '',
		pixelPolygon: row.pixel_polygon as unknown as PixelCoord[],
		name:         row.name,
		category:     row.category,
		featureType:  (row.feature_type ?? 'building') as FeatureType,
		status:       row.status as FootprintSubmission['status']
	};
}

export async function fetchMapFootprints(
	supabase: SupabaseClient<Database>,
	mapId: string
): Promise<FootprintSubmission[]> {
	const { data, error } = await supabase
		.from('footprint_submissions')
		.select('id, map_id, user_id, pixel_polygon, name, category, feature_type, status')
		.eq('map_id', mapId)
		.order('created_at', { ascending: true });

	if (error) { console.error('fetchMapFootprints:', error); return []; }
	return (data as DbFootprint[]).map(toFootprint);
}

export async function createFootprint(
	supabase: SupabaseClient<Database>,
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
			pixel_polygon: params.pixelPolygon as unknown as Json,
			name:          params.name    ?? null,
			category:      params.category ?? null,
			feature_type:  params.featureType ?? 'building',
			status:        'submitted',
			source:        'manual'
		})
		.select('id')
		.single();

	if (error) { console.error('Failed to create footprint:', error); return null; }
	return (data as { id: string }).id;
}

export async function updateFootprint(
	supabase: SupabaseClient<Database>,
	footprintId: string,
	pixelPolygon: PixelCoord[]
): Promise<boolean> {
	const { error } = await supabase
		.from('footprint_submissions')
		.update({ pixel_polygon: pixelPolygon as unknown as Json })
		.eq('id', footprintId);
	if (error) { console.error('Failed to update footprint:', error); return false; }
	return true;
}

export async function updateFootprintMeta(
	supabase: SupabaseClient<Database>,
	footprintId: string,
	meta: { name?: string | null; featureType?: FeatureType; category?: string | null }
): Promise<boolean> {
	const update: FootprintUpdate = {};
	if (meta.name !== undefined)        update.name         = meta.name;
	if (meta.featureType !== undefined) update.feature_type = meta.featureType;
	if (meta.category !== undefined)    update.category     = meta.category;

	const { error } = await supabase
		.from('footprint_submissions')
		.update(update)
		.eq('id', footprintId);
	if (error) { console.error('Failed to update footprint meta:', error); return false; }
	return true;
}

export async function deleteFootprint(
	supabase: SupabaseClient<Database>,
	footprintId: string
): Promise<boolean> {
	const { error } = await supabase
		.from('footprint_submissions')
		.delete()
		.eq('id', footprintId);
	if (error) { console.error('Failed to delete footprint:', error); return false; }
	return true;
}

interface MapJoinRow {
	map_id: string;
	maps: { id: string; name: string | null; allmaps_id: string | null; iiif_image: string | null } | null;
}

// ── Review helpers ────────────────────────────────────────────────────────────

// SamFootprint = FootprintSubmission; kept for backward compat with ReviewMode/ReviewTool/ReviewSidebar
export type SamFootprint = FootprintSubmission;

export async function fetchSubmittedFootprints(
	supabase: SupabaseClient<Database>,
	mapId: string
): Promise<SamFootprint[]> {
	const { data, error } = await supabase
		.from('footprint_submissions')
		.select('id, map_id, user_id, pixel_polygon, name, category, feature_type, status')
		.eq('map_id', mapId)
		.eq('status', 'submitted')
		.order('created_at', { ascending: true });

	if (error) throw new Error(error.message);
	return (data as DbFootprint[]).map(toFootprint);
}

export async function fetchMapsWithSubmittedFootprints(
	supabase: SupabaseClient<Database>
): Promise<{ id: string; name: string; allmapsId: string; iiifImage: string | null; pendingCount: number }[]> {
	const { data, error } = await supabase
		.from('footprint_submissions')
		.select('map_id, maps!inner(id, name, allmaps_id, iiif_image)')
		.eq('status', 'submitted');

	if (error) throw new Error(error.message);

	const counts: Record<string, { id: string; name: string; allmapsId: string; iiifImage: string | null; count: number }> = {};
	for (const row of (data ?? []) as unknown as MapJoinRow[]) {
		const mapRow = row.maps;
		if (!mapRow) continue;
		const mid = mapRow.id;
		if (!counts[mid]) counts[mid] = { id: mid, name: mapRow.name ?? mid, allmapsId: mapRow.allmaps_id ?? '', iiifImage: mapRow.iiif_image ?? null, count: 0 };
		counts[mid].count++;
	}
	return Object.values(counts).map(c => ({ id: c.id, name: c.name, allmapsId: c.allmapsId, iiifImage: c.iiifImage, pendingCount: c.count }));
}
