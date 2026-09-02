import { expect, test } from '@playwright/test';
import {
  buildGallicaQuery,
  gallicaSearchUrl,
  spellingVariants,
  unaccent,
} from '../src/lib/server/gallica';
import {
  filterNlvByYear,
  mergeByDate,
  nlvDate,
  nlvItem,
  nlvSearchUrl,
} from '../src/lib/server/press';

// Pure checks for the two /api/press providers: Gallica's CQL builder and the
// NLV year-window filter.
//
// ponytail: the repo has no unit-test runner, so the pure checks ride the
// Playwright suite as browser-less tests. Nothing here touches the network or
// the dev server.
//
// What matters: Gallica's full text is OCR of colonial print and is mostly
// unaccented. If the unaccented spelling ever falls out of the query, /api/press
// returns nothing for every Vietnamese label and looks merely "empty".

test('unaccent strips Vietnamese diacritics, including đ', () => {
  expect(unaccent('Khánh Hội')).toBe('Khanh Hoi');
  expect(unaccent('Đa Kao')).toBe('Da Kao');
  expect(unaccent('Chợ Lớn đường')).toBe('Cho Lon duong');
});

test('spellingVariants OR-candidates: unaccented first, then hyphenated, then accented', () => {
  expect(spellingVariants('Khánh Hội')).toEqual(['Khanh Hoi', 'Khanh-Hoi', 'Khánh Hội']);
  // Already-hyphenated input normalises to the same three forms.
  expect(spellingVariants('Khanh-Hoi')).toEqual(['Khanh Hoi', 'Khanh-Hoi']);
  // One word has no hyphenated form; plain ASCII has no accented form.
  expect(spellingVariants('Saigon')).toEqual(['Saigon']);
});

test('buildGallicaQuery emits the CQL for a diacritic two-word label', () => {
  expect(buildGallicaQuery('Khánh Hội', 1923, 10)).toBe(
    '((gallica adj "Khanh Hoi") or (gallica adj "Khanh-Hoi") or (gallica adj "Khánh Hội")) ' +
      'and (dc.date >= "1913" and dc.date <= "1933")'
  );
});

test('the unaccented form is always present, and always first', () => {
  for (const label of ['Khánh Hội', 'Chợ Quán', 'Đa Kao', 'Thủ Đức', 'Saigon']) {
    const cql = buildGallicaQuery(label, 1930, 5);
    expect(cql).toContain(`(gallica adj "${unaccent(label)}")`);
    expect(cql.indexOf(`"${unaccent(label)}"`)).toBe(cql.indexOf('"'));
  }
});

test('the date range is year ± window', () => {
  expect(buildGallicaQuery('Saigon', 1900, 0)).toContain(
    '(dc.date >= "1900" and dc.date <= "1900")'
  );
  expect(buildGallicaQuery('Saigon', 1900, 25)).toContain(
    '(dc.date >= "1875" and dc.date <= "1925")'
  );
});

test('quotes and brackets cannot break out of the CQL phrase', () => {
  const cql = buildGallicaQuery('Khanh" or (gallica all "war', 1923, 10);
  // Quote and paren are stripped, so the injection stays inside the phrases.
  expect(cql).toBe(
    '((gallica adj "Khanh or gallica all war") or (gallica adj "Khanh-or-gallica-all-war")) ' +
      'and (dc.date >= "1913" and dc.date <= "1933")'
  );
});

test('gallicaSearchUrl is a well-formed SRU call', () => {
  const url = new URL(gallicaSearchUrl(buildGallicaQuery('Khánh Hội', 1923, 10), 3));
  expect(url.origin + url.pathname).toBe('https://gallica.bnf.fr/SRU');
  expect(url.searchParams.get('operation')).toBe('searchRetrieve');
  expect(url.searchParams.get('version')).toBe('1.2');
  expect(url.searchParams.get('maximumRecords')).toBe('3');
  expect(url.searchParams.get('query')).toContain('gallica adj "Khanh Hoi"');
});

/* ------------------------------------------------------- nlv (baochi.nlv.gov.vn) */

// The proxy ignores every date parameter, so the year window is ours to apply.
// If this filter regresses, /api/press silently answers with the wrong decade.
const NLV_ROWS = [
  {
    article_id: 1,
    title: 'Page 3 Advertisements Column 1',
    date_id: '19230501',
    publication_name: 'Sài Gòn',
    article_url: 'http://baochi.nlv.gov.vn/baochi/cgi-bin/baochi?a=d&d=RbD19230501.2.9.1',
    image_srcset: 'https://p.example/i?w=480 480w, https://p.example/i?w=900 900w',
  },
  {
    article_id: 2,
    title: 'Page 4 Advertisements Column 2',
    date_id: '19360228',
    publication_name: 'Sài Gòn',
    article_url: 'http://baochi.nlv.gov.vn/baochi/cgi-bin/baochi?a=d&d=RbD19360228.2.15.2',
    image_srcset: 'https://p.example/j?w=480 480w, https://p.example/j?w=900 900w',
  },
];

test('the nlv year window keeps 1923 and drops 1936 at ±10 around 1923', () => {
  const kept = filterNlvByYear(NLV_ROWS, 1923, 10);
  expect(kept.map((r) => r.date_id)).toEqual(['19230501']);
  // Widen the window and the 1936 issue comes back.
  expect(filterNlvByYear(NLV_ROWS, 1923, 15).map((r) => r.date_id)).toEqual([
    '19230501',
    '19360228',
  ]);
  // A missing or junk date_id is dropped, never treated as year zero.
  expect(filterNlvByYear([{ date_id: undefined }, { date_id: 'RbD' }], 1923, 10)).toEqual([]);
});

test('nlvDate unpacks date_id, degrading on zeroed parts', () => {
  expect(nlvDate('19360228')).toBe('1936-02-28');
  expect(nlvDate('19360200')).toBe('1936-02');
  expect(nlvDate('19360000')).toBe('1936');
  expect(nlvDate('')).toBe('');
});

test('nlvItem maps a proxy row to the response shape', () => {
  const item = nlvItem(NLV_ROWS[1]);
  expect(item).toEqual({
    source: 'nlv',
    title: 'Sài Gòn — Page 4 Advertisements Column 2',
    date: '1936-02-28',
    snippet: '',
    url: 'http://baochi.nlv.gov.vn/baochi/cgi-bin/baochi?a=d&d=RbD19360228.2.15.2',
    thumb: 'https://p.example/j?w=480',
  });
});

test('nlvSearchUrl sends the label as typed', () => {
  const url = new URL(nlvSearchUrl('Khánh Hội', 50));
  expect(url.origin + url.pathname).toBe('https://baochi-tvqg.vercel.app/api/search');
  expect(url.searchParams.get('q')).toBe('Khánh Hội');
  expect(url.searchParams.get('limit')).toBe('50');
  expect(url.searchParams.get('offset')).toBe('0');
});

/* --------------------------------------------------------------------- merge */

test('mergeByDate interleaves providers chronologically, undated last', () => {
  const merged = mergeByDate(
    [
      [
        { source: 'gallica', title: 'g1', date: '1930', snippet: '', url: 'a', thumb: '' },
        { source: 'gallica', title: 'g2', date: '', snippet: '', url: 'b', thumb: '' },
      ],
      [{ source: 'nlv', title: 'n1', date: '1923-05-01', snippet: '', url: 'c', thumb: '' }],
    ],
    10
  );
  expect(merged.map((i) => i.title)).toEqual(['n1', 'g1', 'g2']);
  expect(mergeByDate([[merged[0]], [merged[1]]], 1)).toHaveLength(1);
});
