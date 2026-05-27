/**
 * timelineStore — in-memory keyframe list for /studio playback.
 *
 * Each keyframe snapshots the current camera (mapStore) and layer stack
 * (layersStore). Not persisted — survives only the editor session.
 */
import { writable, get, type Readable } from 'svelte/store';
import { layersStore, type LayerRef } from '$lib/stores/layersStore';
import type { MapStore } from '$lib/stores/mapStore';

export interface KeyframeOverlay {
	mapId: string;
	allmapsId: string;
	name?: string;
	thumbnail?: string;
	opacity: number;
	visible: boolean;
}

export interface Keyframe {
	id: string;
	label: string;
	duration_ms: number; // transition INTO this keyframe
	hold_ms: number; // pause after arriving
	camera: { lng: number; lat: number; zoom: number; rotation: number };
	layers: {
		base: LayerRef;
		overlays: KeyframeOverlay[]; // top-of-stack first, mirroring layersStore
	};
}

export interface TimelineState {
	frames: Keyframe[];
	currentIndex: number | null; // playback cursor
	isPlaying: boolean;
}

function makeId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	return Math.random().toString(36).slice(2, 10);
}

function snapshot(mapStore: MapStore): Pick<Keyframe, 'camera' | 'layers'> {
	const m = get(mapStore);
	const l = get(layersStore);
	return {
		camera: { lng: m.lng, lat: m.lat, zoom: m.zoom, rotation: m.rotation },
		layers: {
			base: structuredClone(l.base),
			overlays: l.overlays.map((o) => ({
				mapId: o.ref.mapId,
				allmapsId: o.ref.allmapsId,
				name: o.ref.name,
				thumbnail: o.ref.thumbnail,
				opacity: o.opacity,
				visible: o.visible
			}))
		}
	};
}

export interface TimelineStore extends Readable<TimelineState> {
	addFromCurrent(mapStore: MapStore): string;
	update(id: string, patch: Partial<Pick<Keyframe, 'label' | 'duration_ms' | 'hold_ms'>>): void;
	remove(id: string): void;
	reorder(id: string, delta: 1 | -1): void;
	clear(): void;
	setPlaying(playing: boolean, currentIndex?: number | null): void;
	setCurrentIndex(i: number | null): void;
}

function create(): TimelineStore {
	const inner = writable<TimelineState>({ frames: [], currentIndex: null, isPlaying: false });
	const { subscribe, update } = inner;

	return {
		subscribe,

		addFromCurrent(mapStore: MapStore): string {
			const id = makeId();
			update((s) => {
				const frame: Keyframe = {
					id,
					label: `Step ${s.frames.length + 1}`,
					duration_ms: 1500,
					hold_ms: 0,
					...snapshot(mapStore)
				};
				return { ...s, frames: [...s.frames, frame] };
			});
			return id;
		},

		update(id, patch) {
			update((s) => ({
				...s,
				frames: s.frames.map((f) => (f.id === id ? { ...f, ...patch } : f))
			}));
		},

		remove(id) {
			update((s) => ({ ...s, frames: s.frames.filter((f) => f.id !== id) }));
		},

		reorder(id, delta) {
			update((s) => {
				const i = s.frames.findIndex((f) => f.id === id);
				if (i < 0) return s;
				const j = i + delta;
				if (j < 0 || j >= s.frames.length) return s;
				const arr = s.frames.slice();
				[arr[i], arr[j]] = [arr[j], arr[i]];
				return { ...s, frames: arr };
			});
		},

		clear() {
			update((s) => ({ ...s, frames: [], currentIndex: null }));
		},

		setPlaying(playing, currentIndex) {
			update((s) => ({
				...s,
				isPlaying: playing,
				currentIndex: currentIndex === undefined ? s.currentIndex : currentIndex
			}));
		},

		setCurrentIndex(i) {
			update((s) => ({ ...s, currentIndex: i }));
		}
	};
}

export const timelineStore = create();
