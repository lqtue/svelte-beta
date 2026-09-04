import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import type { FootprintSubmission, PixelCoord, FeatureType, LegendItem } from '$lib/data/maps/footprintTypes';
import type { StoredTriage } from '$lib/data/maps/types';

type Json = Database['public']['Tables']['footprint_submissions']['Row']['pixel_polygon'];
type FootprintUpdate = Database['public']['Tables']['footprint_submissions']['Update'];

type LabelMapRow = Pick<
	Database['public']['Tables']['maps']['Row'],
	| 'id'
	| 'name'
	| 'allmaps_id'
	| 'iiif_image'
	| 'label_config'
	| 'triage'
	| 'year'
	| 'location'
	| 'dc_description'
>;

// ── Label Maps ────────────────────────────────────────────────────────────────

export interface LabelMapInfo {
	id: string;
	name: string;
	allmapsId: string;
	iiifImage?: string;
	legend: LegendItem[];
	categories: string[];
	/** `maps.triage` (migration 069) — null when this sheet has never been triaged. */
	triage: StoredTriage | null;
	/** The three fields the picker filters and badges on. */
	year?: number;
	location?: string;
	description?: string;
	/** True once this sheet has any `ocr_extractions` row. */
	hasOcr?: boolean;
}

export async function fetchLabelMaps(supabase: SupabaseClient<Database>): Promise<LabelMapInfo[]> {
	const { data, error } = await supabase
		.from('maps')
		.select('id, name, allmaps_id, iiif_image, label_config, triage, year, location, dc_description')
		.eq('georef_done', true)
		.order('priority', { ascending: false })
		.order('name');

	if (error) { console.error('Failed to fetch label maps:', error); return []; }

	// One extra round trip for the whole pass, rather than a count per row: the
	// picker only needs to know *whether* a sheet has been read, not how much.
	const { data: done } = await supabase.from('ocr_extractions').select('map_id');
	const ocrd = new Set((done ?? []).map((r) => r.map_id));

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
				// The default is `{}`, so "has a neatline" is what distinguishes a saved
				// triage from a map nobody has opened.
				triage:     (r.triage as StoredTriage | null)?.neatline ? (r.triage as StoredTriage) : null,
				year:        r.year ?? undefined,
				location:    r.location ?? undefined,
				description: r.dc_description ?? undefined,
				hasOcr:      ocrd.has(r.id),
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

/**
 * Submit a traced polygon through `/api/contribute/footprints`.
 *
 * Not a direct insert: the endpoint stamps `user_id` from the session and
 * applies a rate limit, neither of which RLS can do. `supabase` stays in the
 * signature so every call site keeps one shape; it is unused here.
 */
export async function createFootprint(
	_supabase: SupabaseClient<Database>,
	params: {
		mapId: string;
		userId: string;
		pixelPolygon: PixelCoord[];
		name?: string | null;
		category?: string | null;
		featureType?: FeatureType;
	}
): Promise<string | null> {
	try {
		const res = await fetch('/api/contribute/footprints', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				map_id:       params.mapId,
				pixel_polygon: params.pixelPolygon,
				name:         params.name ?? null,
				category:     params.category ?? null,
				feature_type: params.featureType ?? 'building'
			})
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) { console.error('Failed to create footprint:', data.message ?? res.statusText); return null; }
		return data.id ?? null;
	} catch (e) {
		console.error('Failed to create footprint:', e);
		return null;
	}
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
