/**
 * Unified notice/notification system for errors, warnings, and info messages
 */

import { writable, derived, type Readable } from 'svelte/store';
import { randomId } from '../utils/id';

export type NoticeLevel = 'error' | 'warning' | 'info' | 'success';

export interface Notice {
	id: string;
	level: NoticeLevel;
	message: string;
	details?: string;
	dismissable?: boolean;
	autoHideMs?: number;
	timestamp: number;
}

export interface NoticeStoreValue {
	notices: Notice[];
}

export interface NoticeStore extends Readable<NoticeStoreValue> {
	add(notice: Omit<Notice, 'id' | 'timestamp'>): string;
	addError(message: string, details?: string): string;
	addWarning(message: string, details?: string): string;
	addInfo(message: string, details?: string): string;
	addSuccess(message: string, details?: string): string;
	remove(id: string): void;
	clear(): void;
	clearLevel(level: NoticeLevel): void;
}

/**
 * Creates a notice store for managing application notifications
 *
 * @example
 * ```ts
 * const notices = createNoticeStore();
 *
 * // Add notices
 * notices.addError('Failed to save');
 * notices.addSuccess('Changes saved!');
 *
 * // With auto-dismiss
 * notices.add({
 *   level: 'info',
 *   message: 'Processing...',
 *   autoHideMs: 3000
 * });
 *
 * // Subscribe to notices
 * $notices.notices.forEach(n => console.log(n.message));
 * ```
 */
export function createNoticeStore(): NoticeStore {
	const { subscribe, update, set } = writable<NoticeStoreValue>({
		notices: []
	});

	const autoHideTimers = new Map<string, ReturnType<typeof setTimeout>>();

	function scheduleAutoHide(id: string, ms: number): void {
		const timer = setTimeout(() => {
			remove(id);
		}, ms);
		autoHideTimers.set(id, timer);
	}

	function clearTimer(id: string): void {
		const timer = autoHideTimers.get(id);
		if (timer !== undefined) {
			clearTimeout(timer);
			autoHideTimers.delete(id);
		}
	}

	function add(notice: Omit<Notice, 'id' | 'timestamp'>): string {
		const id = randomId('notice');
		const fullNotice: Notice = {
			...notice,
			id,
			timestamp: Date.now(),
			dismissable: notice.dismissable ?? true
		};

		update((state) => ({
			notices: [...state.notices, fullNotice]
		}));

		if (notice.autoHideMs && notice.autoHideMs > 0) {
			scheduleAutoHide(id, notice.autoHideMs);
		}

		return id;
	}

	function remove(id: string): void {
		clearTimer(id);
		update((state) => ({
			notices: state.notices.filter((n) => n.id !== id)
		}));
	}

	function clear(): void {
		autoHideTimers.forEach((_, id) => clearTimer(id));
		set({ notices: [] });
	}

	function clearLevel(level: NoticeLevel): void {
		update((state) => {
			const removed = state.notices.filter((n) => n.level === level);
			removed.forEach((n) => clearTimer(n.id));
			return {
				notices: state.notices.filter((n) => n.level !== level)
			};
		});
	}

	return {
		subscribe,
		add,
		addError: (message: string, details?: string) =>
			add({ level: 'error', message, details }),
		addWarning: (message: string, details?: string) =>
			add({ level: 'warning', message, details }),
		addInfo: (message: string, details?: string) =>
			add({ level: 'info', message, details, autoHideMs: 5000 }),
		addSuccess: (message: string, details?: string) =>
			add({ level: 'success', message, details, autoHideMs: 3000 }),
		remove,
		clear,
		clearLevel
	};
}

/**
 * Derived store that returns only notices of a specific level
 */
export function filterNotices(
	store: NoticeStore,
	level: NoticeLevel
): Readable<Notice[]> {
	return derived(store, ($store) =>
		$store.notices.filter((n) => n.level === level)
	);
}

/**
 * Singleton notice store for application-wide notifications
 */
let globalNoticeStore: NoticeStore | null = null;

export function getNoticeStore(): NoticeStore {
	if (!globalNoticeStore) {
		globalNoticeStore = createNoticeStore();
	}
	return globalNoticeStore;
}
