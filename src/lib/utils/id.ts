/**
 * Generates a random ID with optional prefix, e.g. `anno-550e8400-…`.
 *
 * ponytail: crypto.randomUUID needs a secure context — true for localhost dev,
 * HTTPS prod and Cloudflare Workers. Add a Math.random fallback only if this
 * ever has to run over plain http on a LAN address.
 */
export function randomId(prefix = 'id'): string {
	return `${prefix}-${crypto.randomUUID()}`;
}
