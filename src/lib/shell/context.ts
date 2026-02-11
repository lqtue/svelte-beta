/**
 * MapShell Svelte context — exposes the OL Map instance and
 * central stores to any child component.
 *
 * Usage:
 *   // Parent (Studio.svelte) — sets context during init
 *   setShellContext({ map, mapStore, layerStore, annotations });
 *
 *   // Child — reads context
 *   const { map, mapStore, layerStore } = getShellContext();
 */

import { setContext, getContext } from 'svelte';
import type { Writable } from 'svelte/store';
import type Map from 'ol/Map';
import type { MapStore } from '$lib/stores/mapStore';
import type { LayerStore } from '$lib/stores/layerStore';
import type { AnnotationHistoryStore } from '$lib/map/stores/annotationHistory';
import type { AnnotationStateStore } from '$lib/map/stores/annotationState';

const SHELL_CTX = Symbol('shell-context');

export interface ShellContextValue {
	/** Writable holding the OL Map instance (null until mount) */
	map: Writable<Map | null>;
	mapStore: MapStore;
	layerStore: LayerStore;
	/** Optional — only modes with annotation editing populate this */
	annotations?: {
		history: AnnotationHistoryStore;
		state: AnnotationStateStore;
	};
}

export function setShellContext(value: ShellContextValue): void {
	setContext(SHELL_CTX, value);
}

export function getShellContext(): ShellContextValue {
	const ctx = getContext<ShellContextValue>(SHELL_CTX);
	if (!ctx) {
		throw new Error(
			'Shell context not found — is this component inside a <MapShell>?'
		);
	}
	return ctx;
}
