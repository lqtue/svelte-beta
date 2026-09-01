/**
 * Mint a worker token for `work/worker/vma_worker.py`.
 *
 *   node --env-file=.env scripts/mint-worker-key.mjs <name> [kind,kind]
 *
 * Prints the token once — only its sha256 is stored, so a lost token is
 * reminted, not recovered. Revoke with:
 *   update worker_keys set revoked_at = now() where name = '<name>';
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes, createHash } from 'node:crypto';

const [name, kindsArg] = process.argv.slice(2);
if (!name) {
  console.error('usage: node --env-file=.env scripts/mint-worker-key.mjs <name> [kind,kind]');
  process.exit(1);
}

const url = process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey)
  throw new Error('PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');

const token = randomBytes(32).toString('hex');
const kinds = kindsArg
  ? kindsArg
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
  : [];

const { data, error } = await createClient(url, serviceKey, { auth: { persistSession: false } })
  .from('worker_keys')
  .insert({ name, kinds, token_hash: createHash('sha256').update(token).digest('hex') })
  .select('id, name, kinds')
  .single();
if (error) throw error;

console.log(
  `worker key "${data.name}" (${data.kinds.length ? data.kinds.join(', ') : 'all kinds'})`
);
console.log(`\nVMA_API_URL=${process.env.VMA_API_URL ?? 'https://maparchive.vn'}`);
console.log(`VMA_WORKER_KEY=${token}\n`);
console.log('Shown once. Put it in the worker machine’s .env.');
