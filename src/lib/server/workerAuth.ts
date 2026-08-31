/**
 * Bearer-token auth for the pipeline workers (`/api/pipeline/*`).
 *
 * A worker holds a token from `worker_keys`, never the service key: a machine
 * running the OCR pipeline can therefore report results without being able to
 * read or rewrite the rest of the database. Tokens are stored as a sha256 hex
 * digest — the plaintext is printed once by `scripts/mint-worker-key.mjs` and
 * never persisted.
 */

import { error } from '@sveltejs/kit';
import { adminClient } from './supabaseAdmin';

export type WorkerKey = { id: string; name: string; kinds: string[] };

/** sha256 hex, via Web Crypto so this works on Cloudflare as well as in Node. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Resolve the worker behind a request. Throws 401 when the token is missing,
 * unknown or revoked; 403 when the key is not allowed to touch `kind`.
 * An empty `kinds` array on the key means "any kind".
 */
export async function requireWorker(request: Request, kind?: string): Promise<WorkerKey> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw error(401, 'Missing worker token');

  const { data: key } = await adminClient()
    .from('worker_keys')
    .select('id, name, kinds, revoked_at')
    .eq('token_hash', await hashToken(token))
    .maybeSingle();

  if (!key || key.revoked_at) throw error(401, 'Unknown or revoked worker token');
  if (kind && key.kinds.length > 0 && !key.kinds.includes(kind)) {
    throw error(403, `This worker key may not handle ${kind} jobs`);
  }

  // Liveness for the admin view. Not awaited: a slow write here would delay
  // every claim, and a lost heartbeat costs nothing.
  void adminClient()
    .from('worker_keys')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', key.id)
    .then(() => {});

  return { id: key.id, name: key.name, kinds: key.kinds };
}
