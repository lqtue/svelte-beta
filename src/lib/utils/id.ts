/**
 * ID generation utilities
 */

/**
 * Generates a random ID with optional prefix
 *
 * Uses crypto.randomUUID() when available, falls back to timestamp + random
 *
 * @example
 * ```ts
 * randomId() // 'id-550e8400-e29b-41d4-a716-446655440000'
 * randomId('anno') // 'anno-550e8400-e29b-41d4-a716-446655440000'
 * ```
 */
export function randomId(prefix = 'id'): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `${prefix}-${crypto.randomUUID()}`;
	}
	const random = Math.random().toString(36).slice(2, 8);
	return `${prefix}-${Date.now().toString(36)}-${random}`;
}

/**
 * Generates a short random ID (8 characters)
 *
 * @example
 * ```ts
 * shortId() // 'a1b2c3d4'
 * ```
 */
export function shortId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID().slice(0, 8);
	}
	return Math.random().toString(36).slice(2, 10);
}

/**
 * Checks if a string looks like a valid UUID
 */
export function isUuid(value: string): boolean {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	return uuidRegex.test(value);
}

/**
 * Generates a timestamp-based ID for sortable ordering
 *
 * @example
 * ```ts
 * timestampId() // '1705678901234-abc123'
 * ```
 */
export function timestampId(): string {
	const random = Math.random().toString(36).slice(2, 8);
	return `${Date.now()}-${random}`;
}
