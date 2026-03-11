export interface LabelTask {
	id: string;
	mapId: string;
	allmapsId: string;
	region: { x: number; y: number; width: number; height: number };
	status: 'open' | 'in_progress' | 'consensus' | 'verified';
	legend: string[];
}

export interface LabelPin {
	id: string;
	taskId: string;
	userId: string;
	label: string;
	pixelX: number;
	pixelY: number;
	confidence: number;
	data?: { vietnameseName?: string; notes?: string;[key: string]: any };
}

export interface LabelConsensus {
	taskId: string;
	label: string;
	pixelX: number;
	pixelY: number;
	agreementCount: number;
	totalSubmissions: number;
	status: 'pending' | 'agreed' | 'disputed';
}

// [x, y] pairs in IIIF pixel space (y+ = down, matching IIIF convention)
export type PixelCoord = [number, number];

// Polygon features (closed ring): building, land_plot
// Line features (open sequence): road, waterway
export type FeatureType = 'building' | 'land_plot' | 'road' | 'waterway' | 'other';

export const FEATURE_TYPE_LABELS: Record<FeatureType, string> = {
	building: 'Building',
	land_plot: 'Land Plot',
	road: 'Road',
	waterway: 'Waterway',
	other: 'Other'
};

// Geometry kind derived from feature type
export function geometryKind(ft: FeatureType): 'Polygon' | 'LineString' {
	return ft === 'road' || ft === 'waterway' ? 'LineString' : 'Polygon';
}

export interface FootprintSubmission {
	id: string;
	taskId: string;
	pinId: string | null;
	userId: string;
	pixelPolygon: PixelCoord[]; // closed ring for Polygon, open sequence for LineString
	label: string | null;
	featureType: FeatureType;
	status: 'submitted' | 'consensus' | 'verified' | 'rejected';
}
