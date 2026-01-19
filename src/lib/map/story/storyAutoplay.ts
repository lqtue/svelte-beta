/**
 * Story autoplay timer management
 */

import type { StoryScene } from '$lib/viewer/types';
import { clampStoryDelay, findNextVisibleIndex } from './storyStore';

export interface AutoplayController {
	start(): void;
	stop(): void;
	toggle(): void;
	isRunning(): boolean;
	cleanup(): void;
}

export interface AutoplayOptions {
	scenes: StoryScene[];
	currentIndex: number;
	onAdvance: (nextIndex: number) => Promise<void>;
	onStateChange?: (running: boolean) => void;
}

/**
 * Creates an autoplay controller for story scenes
 */
export function createAutoplayController(options: AutoplayOptions): AutoplayController {
	const { scenes, onAdvance, onStateChange } = options;

	let timerId: ReturnType<typeof setTimeout> | undefined;
	let running = false;
	let currentIndex = options.currentIndex;

	function scheduleNext(): void {
		if (!running) return;

		const nextIndex = findNextVisibleIndex(scenes, currentIndex, 1);
		if (nextIndex === null || nextIndex === currentIndex) {
			stop();
			return;
		}

		const currentScene = scenes[currentIndex];
		const delayMs = clampStoryDelay(currentScene?.delay ?? 5) * 1000;

		timerId = setTimeout(async () => {
			if (!running) return;
			currentIndex = nextIndex;
			try {
				await onAdvance(nextIndex);
			} catch (error) {
				console.error('Failed to advance story scene', error);
			}
			scheduleNext();
		}, delayMs);
	}

	function start(): void {
		if (running) return;
		running = true;
		onStateChange?.(true);
		scheduleNext();
	}

	function stop(): void {
		if (timerId !== undefined) {
			clearTimeout(timerId);
			timerId = undefined;
		}
		running = false;
		onStateChange?.(false);
	}

	function toggle(): void {
		if (running) {
			stop();
		} else {
			start();
		}
	}

	function isRunning(): boolean {
		return running;
	}

	function cleanup(): void {
		stop();
	}

	return {
		start,
		stop,
		toggle,
		isRunning,
		cleanup
	};
}

/**
 * Simple autoplay timer class for managing scene transitions
 */
export class StoryAutoplayTimer {
	private timerId: ReturnType<typeof setTimeout> | undefined;

	schedule(delayMs: number, callback: () => void): void {
		this.clear();
		this.timerId = setTimeout(callback, delayMs);
	}

	clear(): void {
		if (this.timerId !== undefined) {
			clearTimeout(this.timerId);
			this.timerId = undefined;
		}
	}

	isScheduled(): boolean {
		return this.timerId !== undefined;
	}
}
