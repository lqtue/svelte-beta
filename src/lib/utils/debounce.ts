/**
 * Debounce utility
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
