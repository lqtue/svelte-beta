export interface LabelTask {
	id: string;
	mapId: string;
	region: { x: number; y: number; width: number; height: number };
	status: 'open' | 'in_progress' | 'consensus' | 'verified';
}

export interface LabelPin {
	id: string;
	taskId: string;
	userId: string;
	label: string;
	pixelX: number;
	pixelY: number;
	confidence: number;
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
