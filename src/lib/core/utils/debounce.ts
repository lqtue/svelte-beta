/**
 * Debounce and throttle utilities
 */

export interface DebouncedFunction<T extends (...args: unknown[]) => unknown> {
	(...args: Parameters<T>): void;
	cancel(): void;
	flush(): void;
}

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 *
 * @example
 * ```ts
 * const debouncedSave = debounce(saveData, 300);
 * debouncedSave(); // Called after 300ms of no calls
 * debouncedSave.cancel(); // Cancel pending invocation
 * debouncedSave.flush(); // Execute immediately
 * ```
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
	fn: T,
	waitMs: number
): DebouncedFunction<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let lastArgs: Parameters<T> | undefined;

	function debounced(...args: Parameters<T>): void {
		lastArgs = args;
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(() => {
			fn(...args);
			timeoutId = undefined;
			lastArgs = undefined;
		}, waitMs);
	}

	debounced.cancel = () => {
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
			timeoutId = undefined;
			lastArgs = undefined;
		}
	};

	debounced.flush = () => {
		if (timeoutId !== undefined && lastArgs !== undefined) {
			clearTimeout(timeoutId);
			fn(...lastArgs);
			timeoutId = undefined;
			lastArgs = undefined;
		}
	};

	return debounced;
}

export interface ThrottledFunction<T extends (...args: unknown[]) => unknown> {
	(...args: Parameters<T>): void;
	cancel(): void;
}

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds.
 *
 * @example
 * ```ts
 * const throttledScroll = throttle(handleScroll, 100);
 * window.addEventListener('scroll', throttledScroll);
 * ```
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
	fn: T,
	waitMs: number
): ThrottledFunction<T> {
	let lastTime = 0;
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let lastArgs: Parameters<T> | undefined;

	function throttled(...args: Parameters<T>): void {
		const now = Date.now();
		const remaining = waitMs - (now - lastTime);

		lastArgs = args;

		if (remaining <= 0 || remaining > waitMs) {
			if (timeoutId !== undefined) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}
			lastTime = now;
			fn(...args);
		} else if (timeoutId === undefined) {
			timeoutId = setTimeout(() => {
				lastTime = Date.now();
				timeoutId = undefined;
				if (lastArgs !== undefined) {
					fn(...lastArgs);
				}
			}, remaining);
		}
	}

	throttled.cancel = () => {
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
			timeoutId = undefined;
		}
		lastArgs = undefined;
	};

	return throttled;
}

/**
 * Executes a function after a delay, cancelling any previous scheduled execution
 *
 * @example
 * ```ts
 * const delayedAction = createDelayedAction();
 * delayedAction(300, () => console.log('Executed after 300ms'));
 * delayedAction(500, () => console.log('This replaces previous, executes after 500ms'));
 * ```
 */
export function createDelayedAction() {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	return function schedule(delayMs: number, fn: () => void): () => void {
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(() => {
			fn();
			timeoutId = undefined;
		}, delayMs);

		return () => {
			if (timeoutId !== undefined) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}
		};
	};
}
