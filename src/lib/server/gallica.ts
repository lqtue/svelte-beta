/**
 * Gallica (BnF) — the French-language colonial press provider behind
 * `GET /api/press` (time-machine E3). `./press.ts` owns the contract and merges
 * this with the National Library of Vietnam provider.
 *
 * Two public Gallica endpoints, no key, no stored state:
 *  - SRU `searchRetrieve` for the record list (title / date / ark), and
 *  - `services/ContentSearch` for a page-level snippet per ark.
 *
 * Gallica's full text is OCR of colonial-era print and is *mostly unaccented*,
 * so a query for a Vietnamese place name has to carry the unaccented spelling
 * or it matches nothing — see `spellingVariants`.
 *
 * Runs on Cloudflare Workers: `fetch`, `URLSearchParams`, `AbortController` and
 * regex only. No Node builtins, no DOMParser, no dependency.
 */

import type { PressItem } from './press';

export type GallicaResult = {
  items: PressItem[];
  /** The CQL actually sent to Gallica. Returned so a caller can cite/debug it. */
  query: string;
  /** Present only when the lookup degraded; `items` is then empty. */
  reason?: string;
};

const SRU_ENDPOINT = 'https://gallica.bnf.fr/SRU';
const CONTENT_SEARCH = 'https://gallica.bnf.fr/services/ContentSearch';
const UA = 'VietnamMapArchive/1.0 (+https://maparchive.vn; period press lookup)';

/** One deadline for the whole lookup — search plus snippets. */
const DEADLINE_MS = 6_000;
/** ContentSearch costs a request per record, so only the top few get a snippet. */
const SNIPPET_ITEMS = 5;
const SNIPPET_CHARS = 240;

/* ------------------------------------------------------------------ query */

/**
 * Strip diacritics the way a 1920s French typesetter would have: NFD-decompose
 * and drop the combining marks, then handle `đ`, which has no decomposition.
 */
export function unaccent(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * The spellings one Vietnamese place name takes in a French OCR corpus:
 * unaccented and spaced ("Khanh Hoi"), unaccented and hyphenated
 * ("Khanh-Hoi", the colonial press's own house style), and the modern accented
 * form ("Khánh Hội"). The unaccented form is always first and always present.
 *
 * ponytail: three fixed forms off the raw label. The gazetteer (E1b
 * `place_names.variants[]`) is what should eventually feed this — historical
 * renamings ("rue de Canton" → "Triệu Quang Phục") are not derivable from
 * spelling and this function does not pretend otherwise.
 */
export function spellingVariants(name: string): string[] {
  // A quote would terminate the CQL phrase and a bracket would confuse its
  // grouping, so neither ever reaches the query — no place name needs them.
  // A hyphen comes back below as a variant rather than staying as typed.
  const clean = name
    .replace(/["()[\]{}\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];
  const plain = unaccent(clean);
  const out = [plain];
  if (plain.includes(' ')) out.push(plain.replace(/ /g, '-'));
  if (clean !== plain) out.push(clean);
  return [...new Set(out)];
}

/**
 * Build the CQL for one place name in one period. Pure — this is the piece
 * `tests/gallica.spec.ts` pins.
 *
 * `((gallica adj "Khanh Hoi") or (gallica adj "Khanh-Hoi") or (gallica adj "Khánh Hội"))
 *   and (dc.date >= "1913" and dc.date <= "1933")`
 *
 * `adj` is Gallica's phrase operator: adjacent words in order, which is what
 * keeps a two-word name from matching every page holding either word.
 */
export function buildGallicaQuery(q: string, year: number, windowYears: number): string {
  const variants = spellingVariants(q);
  if (!variants.length) throw new Error('buildGallicaQuery: empty query');
  const phrases = variants.map((v) => `(gallica adj "${v}")`).join(' or ');
  const from = Math.trunc(year) - Math.trunc(windowYears);
  const to = Math.trunc(year) + Math.trunc(windowYears);
  // ponytail: no `dc.type` filter. Restricting to "fascicule" would give press
  // issues only and drop the Annuaire directories, which are the better source.
  return `(${phrases}) and (dc.date >= "${from}" and dc.date <= "${to}")`;
}

/** The SRU URL for a CQL string. Exported so the test can show the real call. */
export function gallicaSearchUrl(cql: string, limit: number): string {
  const p = new URLSearchParams({
    operation: 'searchRetrieve',
    version: '1.2',
    query: cql,
    maximumRecords: String(limit),
  });
  return `${SRU_ENDPOINT}?${p}`;
}

/* -------------------------------------------------------------- xml reading */

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * ponytail: entity decode + tag match by regex, not a parser. Both payloads are
 * flat, machine-generated XML from one publisher; a real parser is a dependency
 * (or DOMParser, which Workers do not have) for no gain.
 */
function decodeEntities(s: string): string {
  return s.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] !== '#') return NAMED[body.toLowerCase()] ?? whole;
    const hex = body[1] === 'x' || body[1] === 'X';
    const cp = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
  });
}

/** First `<ns:name>…</ns:name>` in `xml`, entity-decoded. */
function tagText(xml: string, name: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`);
  const m = re.exec(xml);
  return m ? decodeEntities(m[1]).trim() : null;
}

const RECORD_RE = /<(?:\w+:)?record(?:\s[^>]*)?>[\s\S]*?<\/(?:\w+:)?record>/g;
const ARK_RE = /ark:\/[0-9]+\/([A-Za-z0-9._-]+)/;

type ParsedRecord = { item: PressItem; ark: string };

function parseSruRecords(xml: string, limit: number): ParsedRecord[] {
  const out: ParsedRecord[] = [];
  for (const chunk of xml.match(RECORD_RE) ?? []) {
    // A record carries several dc:identifier values (catalogue notice, ISSN…);
    // the ark one is the digitised object.
    const identifier = (chunk.match(/<dc:identifier>([\s\S]*?)<\/dc:identifier>/g) ?? [])
      .map((t) => decodeEntities(t.replace(/<[^>]*>/g, '')).trim())
      .find((v) => ARK_RE.test(v));
    if (!identifier) continue;
    const ark = ARK_RE.exec(identifier)![1];
    out.push({
      ark,
      item: {
        source: 'gallica',
        title: tagText(chunk, 'title') ?? '(untitled)',
        date: tagText(chunk, 'date') ?? '',
        snippet: '',
        url: identifier,
        // Gallica serves a thumbnail off the ark URL for every object.
        thumb: `${identifier}.thumbnail`,
      },
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * ContentSearch's `<content>` is double-escaped: the highlight markup arrives as
 * `&lt;span…&gt;` and its characters as `&amp;#242;`. So: decode, strip tags,
 * decode again.
 */
function readSnippet(xml: string): string {
  const raw = tagText(xml, 'content');
  if (!raw) return '';
  return decodeEntities(raw.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SNIPPET_CHARS);
}

/* ----------------------------------------------------------------- fetching */

function get(url: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, {
    signal,
    headers: { Accept: 'application/xml', 'User-Agent': UA },
  });
}

/**
 * Query Gallica for press mentioning `q` within `year ± windowYears`.
 *
 * Degrades, never throws: a timeout, an outage or an unrecognised payload comes
 * back as `{ items: [], reason }` so the caller can still answer 200.
 */
export async function fetchGallicaPress(opts: {
  q: string;
  year: number;
  windowYears: number;
  limit: number;
}): Promise<GallicaResult> {
  const cql = buildGallicaQuery(opts.q, opts.year, opts.windowYears);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
  try {
    const res = await get(gallicaSearchUrl(cql, opts.limit), controller.signal);
    if (!res.ok) return { items: [], query: cql, reason: `gallica http ${res.status}` };
    const xml = await res.text();
    const records = parseSruRecords(xml, opts.limit);

    if (!records.length) {
      // Zero hits is a real answer; a diagnostic or unparseable body is not.
      if (/<(?:\w+:)?diagnostic/.test(xml))
        return { items: [], query: cql, reason: tagText(xml, 'message') ?? 'gallica diagnostic' };
      if (!/<(?:\w+:)?numberOfRecords>/.test(xml))
        return { items: [], query: cql, reason: 'unrecognised gallica response' };
      return { items: [], query: cql };
    }

    // ContentSearch takes plain terms, not CQL — the unaccented form is the one
    // that matches the OCR.
    const terms = spellingVariants(opts.q)[0];
    await Promise.all(
      records.slice(0, SNIPPET_ITEMS).map(async (r) => {
        try {
          const p = new URLSearchParams({ ark: r.ark, query: terms });
          const cs = await get(`${CONTENT_SEARCH}?${p}`, controller.signal);
          if (cs.ok) r.item.snippet = readSnippet(await cs.text());
        } catch {
          // A missing snippet is not a failed lookup. Leave it empty.
        }
      })
    );
    return { items: records.map((r) => r.item), query: cql };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    console.error('[press] gallica lookup failed:', e);
    return { items: [], query: cql, reason: aborted ? 'gallica timeout' : 'gallica unreachable' };
  } finally {
    clearTimeout(timer);
  }
}
