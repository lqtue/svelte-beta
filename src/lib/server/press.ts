/**
 * Period press lookup — the data half of `GET /api/press` (time-machine E3).
 *
 * Two providers, queried in parallel, merged chronologically:
 *  - **gallica** (`./gallica.ts`) — BnF. The French-language colonial press:
 *    *L'Écho annamite*, *Le Courrier saïgonnais*, the *Annuaire général*.
 *  - **nlv** (here) — the National Library of Vietnam's newspaper archive
 *    (`baochi.nlv.gov.vn`): *Sài Gòn*, *Công luận báo*, *Điện tín* and ~76 other
 *    titles. The Vietnamese-language press, and the better source for a
 *    Vietnamese place name after 1900.
 *
 * Nothing is stored. One provider failing never fails the response — the caller
 * still answers 200 and names the degradation in `reason`.
 *
 * Runs on Cloudflare Workers: `fetch`, `URLSearchParams`, `AbortController`.
 * No Node builtins, no dependency.
 */

import { fetchGallicaPress } from './gallica';

export type PressSource = 'gallica' | 'nlv';

export type PressItem = {
  source: PressSource;
  title: string;
  /** ISO-ish: `YYYY`, `YYYY-MM-DD`, or whatever the provider gave. */
  date: string;
  snippet: string;
  url: string;
  thumb: string;
};

export type PressResult = {
  items: PressItem[];
  /** The providers asked, in request order. */
  sources: PressSource[];
  /** The Gallica CQL, when Gallica was one of them. Returned to cite/debug. */
  query?: string;
  /** Present only when a provider degraded. */
  reason?: string;
};

/**
 * ponytail: the National Library has no public API of its own, so this is the
 * hanoimaps project's Vercel proxy in front of `baochi.nlv.gov.vn` — a courtesy,
 * not an institutional endpoint. Hence: one request per lookup, a bounded
 * timeout, the route's 24 h edge cache, and no retry, ever. The durable fixes
 * are the library's own interface at baochi.nlv.gov.vn or asking hanoimaps for
 * permission; until one of those, treat an `nlv` failure as normal.
 */
const NLV_ENDPOINT = 'https://baochi-tvqg.vercel.app/api/search';
/**
 * Measured: the proxy answers in ~7.5 s regardless of `limit` (the upstream CGI
 * is the cost, not the page size), so a "short" timeout has to be this long to
 * be worth having at all. Only the first caller of a (q, decade) pays it — the
 * route's 24 h edge cache absorbs the rest.
 */
const NLV_DEADLINE_MS = 9_000;
/**
 * ponytail: the proxy ignores every date parameter (`date_from`, `date_to`,
 * `year`, `from`/`to`, `publication` were all probed — identical results), so
 * the year window is applied here on `date_id`. Consequence, and the ceiling:
 * we over-fetch by this factor and filter down, which means a narrow window can
 * legitimately come back empty even though the archive holds matches outside it.
 * A real date filter has to come from the upstream interface.
 */
const NLV_OVERFETCH = 5;
const NLV_MAX_FETCH = 60;
/** The proxy has no /api/publications (404) — do not try to enumerate titles. */

type NlvResult = {
  title?: string;
  date_id?: string;
  publication_name?: string;
  article_url?: string;
  image_srcset?: string;
  image_url?: string;
};

/** `"19360228"` → 1936. Null when the id is not a plausible packed date. */
export function nlvYear(dateId: string | undefined): number | null {
  const y = Number((dateId ?? '').slice(0, 4));
  return Number.isInteger(y) && y > 1400 && y < 2200 ? y : null;
}

/** `"19360228"` → `"1936-02-28"`; a zeroed month/day degrades to `"1936"`. */
export function nlvDate(dateId: string | undefined): string {
  const y = nlvYear(dateId);
  if (!y) return '';
  const mm = (dateId ?? '').slice(4, 6);
  const dd = (dateId ?? '').slice(6, 8);
  if (!/^\d\d$/.test(mm) || mm === '00') return String(y);
  if (!/^\d\d$/.test(dd) || dd === '00') return `${y}-${mm}`;
  return `${y}-${mm}-${dd}`;
}

/** Pure: keep only results whose `date_id` year is inside `year ± windowYears`. */
export function filterNlvByYear<T extends { date_id?: string }>(
  results: T[],
  year: number,
  windowYears: number
): T[] {
  const lo = Math.trunc(year) - Math.trunc(windowYears);
  const hi = Math.trunc(year) + Math.trunc(windowYears);
  return results.filter((r) => {
    const y = nlvYear(r.date_id);
    return y !== null && y >= lo && y <= hi;
  });
}

/** Pure: one proxy result → the response item shape. */
export function nlvItem(r: NlvResult): PressItem {
  const pub = (r.publication_name ?? '').trim();
  const headline = (r.title ?? '').trim();
  // The 480w candidate off image_srcset; image_url is the 900w one.
  const thumb = r.image_srcset?.split(',')[0]?.trim().split(' ')[0] ?? r.image_url ?? '';
  return {
    source: 'nlv',
    title: [pub, headline].filter(Boolean).join(' — ') || '(untitled)',
    date: nlvDate(r.date_id),
    // ponytail: the proxy returns no matched text, only the page image. The
    // image *is* the evidence here; a snippet would need the upstream OCR.
    snippet: '',
    url: r.article_url ?? '',
    thumb,
  };
}

export function nlvSearchUrl(q: string, limit: number): string {
  const p = new URLSearchParams({ q, limit: String(limit), offset: '0' });
  return `${NLV_ENDPOINT}?${p}`;
}

async function fetchNlvPress(opts: {
  q: string;
  year: number;
  windowYears: number;
  limit: number;
}): Promise<PressItem[]> {
  const ask = Math.min(NLV_MAX_FETCH, opts.limit * NLV_OVERFETCH);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NLV_DEADLINE_MS);
  try {
    // ponytail: the label goes over as typed — one query, no spelling variants.
    // The proxy exposes no OR syntax, and its corpus is accented Vietnamese.
    const res = await fetch(nlvSearchUrl(opts.q, ask), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`nlv http ${res.status}`);
    const body = (await res.json()) as { results?: NlvResult[] };
    const rows = Array.isArray(body?.results) ? body.results : [];
    return filterNlvByYear(rows, opts.year, opts.windowYears)
      .slice(0, opts.limit)
      .map(nlvItem)
      .filter((i) => i.url);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pure: merge provider lists into one chronological run. Undated items sink to
 * the end rather than sorting as year zero.
 */
export function mergeByDate(lists: PressItem[][], limit: number): PressItem[] {
  return lists
    .flat()
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))
    .slice(0, limit);
}

/**
 * Query the requested providers for press mentioning `q` within
 * `year ± windowYears`. Degrades, never throws.
 */
export async function fetchPress(opts: {
  q: string;
  /**
   * Attested spellings from the gazetteer (`place_names.variants[]`), if the
   * caller has them. Only Gallica uses them: its full text is OCR'd and its
   * house style hyphenates, so more real forms means more hits. The NLV proxy
   * takes a single query string, so it still gets the label as typed.
   */
  extra?: string[];
  year: number;
  windowYears: number;
  limit: number;
  sources: PressSource[];
}): Promise<PressResult> {
  const { sources } = opts;
  const settled = await Promise.allSettled([
    sources.includes('gallica') ? fetchGallicaPress(opts) : null,
    sources.includes('nlv') ? fetchNlvPress(opts) : null,
  ]);

  const reasons: string[] = [];
  const lists: PressItem[][] = [];
  let query: string | undefined;

  const [gallica, nlv] = settled;
  if (gallica.status === 'fulfilled' && gallica.value) {
    query = gallica.value.query;
    if (gallica.value.reason) reasons.push(gallica.value.reason);
    lists.push(gallica.value.items);
  } else if (gallica.status === 'rejected') {
    // fetchGallicaPress swallows its own failures; this is belt-and-braces.
    console.error('[press] gallica rejected:', gallica.reason);
    reasons.push('gallica unavailable');
  }
  if (nlv.status === 'fulfilled' && nlv.value) {
    lists.push(nlv.value);
  } else if (nlv.status === 'rejected') {
    console.error('[press] nlv rejected:', nlv.reason);
    reasons.push(
      nlv.reason instanceof Error && nlv.reason.name === 'AbortError'
        ? 'nlv timeout'
        : 'nlv unavailable'
    );
  }

  return {
    items: mergeByDate(lists, opts.limit),
    sources,
    query,
    reason: reasons.length ? reasons.join('; ') : undefined,
  };
}
