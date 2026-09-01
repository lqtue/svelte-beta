/**
 * Small HTTP helpers shared by `src/routes/api/**`.
 */

import { error } from '@sveltejs/kit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a route param that is used as a Postgres `uuid`. Without this a
 * malformed id reaches the database and comes back as a raw cast error.
 */
export function assertUuid(id: string | undefined, label = 'id'): string {
  if (!id || !UUID_RE.test(id)) throw error(400, `Invalid ${label}`);
  return id;
}

/**
 * Turn a PostgREST error into a 500 without leaking column or constraint names
 * to the client. The detail is logged server-side instead.
 */
export function dbError(e: unknown, msg = 'Database error'): never {
  const detail =
    e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : e;
  console.error(`[api] ${msg}:`, detail);
  throw error(500, msg);
}
