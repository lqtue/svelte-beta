/**
 * CSS clip-path utilities for view mode overlays
 */

import type { ViewMode } from './viewModeStore';

export interface ClipMaskParams {
	mode: ViewMode;
	width: number;
	height: number;
	sideRatio: number;
	lensRadius: number;
}

/**
 * Generates a CSS clip-path value for the given view mode
 */
export function getClipPath(params: ClipMaskParams): string {
	const { mode, width: w, height: h, sideRatio, lensRadius } = params;

	switch (mode) {
		case 'overlay':
			return '';

		case 'side-x': {
			const x = w * sideRatio;
			return `polygon(${x}px 0, ${w}px 0, ${w}px ${h}px, ${x}px ${h}px)`;
		}

		case 'side-y': {
			const y = h * sideRatio;
			return `polygon(0 ${y}px, ${w}px ${y}px, ${w}px ${h}px, 0 ${h}px)`;
		}

		case 'spy': {
			const r = lensRadius;
			return `circle(${r}px at ${w / 2}px ${h / 2}px)`;
		}

		default:
			return '';
	}
}

/**
 * Applies the clip-path to a canvas element
 */
export function applyClipMask(canvas: HTMLCanvasElement | null, params: ClipMaskParams): void {
	if (!canvas) return;
	canvas.style.clipPath = getClipPath(params);
}

/**
 * Clears the clip-path from a canvas element
 */
export function clearClipMask(canvas: HTMLCanvasElement | null): void {
	if (!canvas) return;
	canvas.style.clipPath = '';
}

export interface DividerPosition {
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	show: boolean;
}

/**
 * Calculates divider position for vertical split mode (side-x)
 */
export function getVerticalDividerPosition(
	width: number,
	height: number,
	sideRatio: number,
	mode: ViewMode
): DividerPosition {
	if (mode !== 'side-x') {
		return { show: false };
	}
	const x = width * sideRatio;
	return {
		x,
		height,
		show: true
	};
}

/**
 * Calculates divider position for horizontal split mode (side-y)
 */
export function getHorizontalDividerPosition(
	width: number,
	height: number,
	sideRatio: number,
	mode: ViewMode
): DividerPosition {
	if (mode !== 'side-y') {
		return { show: false };
	}
	const y = height * sideRatio;
	return {
		y,
		width,
		show: true
	};
}

export interface LensPosition {
	x: number;
	y: number;
	diameter: number;
	handleX: number;
	handleY: number;
	show: boolean;
}

/**
 * Calculates lens position for spy glass mode
 */
export function getLensPosition(
	width: number,
	height: number,
	lensRadius: number,
	mode: ViewMode
): LensPosition {
	if (mode !== 'spy') {
		return { x: 0, y: 0, diameter: 0, handleX: 0, handleY: 0, show: false };
	}
	const diameter = Math.max(20, lensRadius * 2);
	const x = width / 2 - lensRadius;
	const y = height / 2 - lensRadius;
	const handleX = width / 2 + lensRadius - 8;
	const handleY = height / 2 - 8;

	return { x, y, diameter, handleX, handleY, show: true };
}

/**
 * Calculates maximum allowed lens radius for the given dimensions
 */
export function getMaxLensRadius(width: number, height: number): number {
	return Math.min(width, height) / 2;
}

/**
 * Clamps lens radius to valid bounds
 */
export function clampLensRadius(radius: number, width: number, height: number): number {
	const maxRadius = getMaxLensRadius(width, height);
	return Math.max(20, Math.min(radius, maxRadius));
}
