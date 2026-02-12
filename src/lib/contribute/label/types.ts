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
