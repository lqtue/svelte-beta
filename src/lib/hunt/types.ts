export type StopInteraction = 'proximity' | 'qr' | 'camera';

export interface HuntStop {
  id: string;
  order: number;
  title: string;
  description: string;
  hint?: string;
  quest?: string;
  coordinates: [number, number]; // [lon, lat] EPSG:4326
  triggerRadius: number;         // meters, default 10
  interaction: StopInteraction;
  qrPayload?: string;
  overlayMapId?: string;         // Allmaps ID — historical map revealed at this stop
}

export interface TreasureHunt {
  id: string;
  title: string;
  description: string;
  stops: HuntStop[];
  region?: { center: [number, number]; zoom: number };
  createdAt: number;
  updatedAt: number;
}

export interface HuntProgress {
  huntId: string;
  currentStopIndex: number;
  completedStops: string[];
  startedAt: number;
  completedAt?: number;
}

export interface HuntPlayerState {
  activeHuntId: string | null;
  progress: Record<string, HuntProgress>;
}
