/**
 * GET /api/press?q=<place name>&year=<YYYY>&window=<years>&limit=<n>&provider=<both|gallica|nlv>
 *                &variants=<csv of attested spellings>
 *
 * Public, no auth, no database — "in the press, ±10 years" for a label on a map
 * (time-machine plan, E3). Nothing is stored: the query is built from the label,
 * two newspaper archives answer, the edge caches the answer for a day.
 *
 * Response: { items: [{ source, title, date, snippet, url, thumb }], sources,
 *             query?, reason? } — always 200, so a provider outage leaves a
 * thinner panel on /explore rather than an error toast.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchPress, type PressSource } from '$lib/server/press';

const MAX_Q = 80;
/** Attested spellings a caller may supply; each becomes another OR clause. */
const MAX_VARIANTS = 6;
const YEAR_MIN = 1400;
const YEAR_MAX = 2100;

const PROVIDERS: Record<string, PressSource[]> = {
  both: ['gallica', 'nlv'],
  gallica: ['gallica'],
  nlv: ['nlv'],
};

/** Optional integer param → clamped, or the default when absent/garbage. */
function clamped(raw: string | null, lo: number, hi: number, fallback: number): number {
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

export const GET: RequestHandler = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!q) throw error(400, 'q is required');
  if (q.length > MAX_Q) throw error(400, `q must be ${MAX_Q} characters or fewer`);

  const year = Number(url.searchParams.get('year'));
  if (!Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX)
    throw error(400, `year must be an integer between ${YEAR_MIN} and ${YEAR_MAX}`);

  const provider = url.searchParams.get('provider') ?? 'both';
  const sources = PROVIDERS[provider];
  if (!sources) throw error(400, 'provider must be one of: both, gallica, nlv');

  // The gazetteer knows how a place was actually written; a caller holding
  // those forms (the /place page does) passes them rather than making the
  // query builder guess. Capped and length-checked like `q` itself.
  const variants = (url.searchParams.get('variants') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v && v.length <= MAX_Q)
    .slice(0, MAX_VARIANTS);

  const windowYears = clamped(url.searchParams.get('window'), 0, 50, 10);
  const limit = clamped(url.searchParams.get('limit'), 1, 25, 10);

  const result = await fetchPress({ q, year, windowYears, limit, sources, extra: variants });

  return json(result, {
    headers: {
      // A day on a good answer, so the CF edge absorbs repeats and each archive
      // sees one call per (q, decade). A minute when a provider degraded —
      // caching an outage for 24 h would outlast the outage.
      'Cache-Control': result.reason ? 'public, max-age=60' : 'public, max-age=86400',
    },
  });
};
