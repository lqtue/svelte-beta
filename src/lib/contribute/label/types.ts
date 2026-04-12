// Legend items: simple string ("Building") or transcription object ({val: "1", label: "Abattoir Municipal"})
export type LegendItem = string | { val: string; label: string };

export interface LabelPin {
	id: string;
	mapId: string;
	userId: string;
	label: string;
	pixelX: number;
	pixelY: number;
	data?: { vietnameseName?: string; notes?: string; [key: string]: any };
}

// [x, y] pairs in IIIF pixel space (y+ = down, matching IIIF convention)
export type PixelCoord = [number, number];

// Geometry type — determines Polygon vs LineString rendering
// Polygon: building, land_plot, green_space, water_body
// LineString: road, waterway
export type FeatureType =
	| 'building'
	| 'land_plot'
	| 'road'
	| 'waterway'
	| 'green_space'   // parks, gardens, cemeteries
	| 'water_body'    // lakes, ponds (area, not flowing)
	| 'other';

export const FEATURE_TYPE_LABELS: Record<FeatureType, string> = {
	building:    'Building',
	land_plot:   'Land Plot',
	road:        'Road',
	waterway:    'Waterway',
	green_space: 'Green Space',
	water_body:  'Water Body',
	other:       'Other'
};

// Geometry kind derived from feature type
export function geometryKind(ft: FeatureType): 'Polygon' | 'LineString' {
	return ft === 'road' || ft === 'waterway' ? 'LineString' : 'Polygon';
}

// Canonical SAM color-class categories (matches vectorize.py color profiles)
export type SamCategory = 'particulier' | 'communal' | 'militaire' | 'local_svc' | 'non_affect';

export const SAM_CATEGORY_LABELS: Record<SamCategory, string> = {
	particulier: 'Particulier (Private)',
	communal:    'Communal',
	militaire:   'Militaire',
	local_svc:   'Local Service',
	non_affect:  'Non-affecté'
};

// Guard: check if a string is a known SAM category
export function isSamCategory(s: string): s is SamCategory {
	return s === 'particulier' || s === 'communal' || s === 'militaire'
		|| s === 'local_svc' || s === 'non_affect';
}

export interface FootprintSubmission {
	id: string;
	mapId: string;
	userId: string;
	pixelPolygon: PixelCoord[]; // closed ring for Polygon, open sequence for LineString
	name: string | null;
	category: string | null;
	featureType: FeatureType;
	status: 'draft' | 'submitted' | 'approved' | 'rejected';
}
