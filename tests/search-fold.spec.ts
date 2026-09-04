/**
 * Pure checks for the map picker's diacritic folding. No browser, no network —
 * they ride the Playwright runner because it is already installed.
 *
 * These exist because the contribute picker matched raw substrings until
 * 2026-09-04: on a corpus that is half Vietnamese and half French, that made it
 * searchable only by someone willing to type the accents.
 */
import { test, expect } from '@playwright/test';
import { unaccent, foldForSearch, matchesAllTerms } from '../src/lib/core/utils/unaccent';

test('unaccent drops combining marks and the đ that has none', () => {
  expect(unaccent('Sài Gòn')).toBe('Sai Gon');
  expect(unaccent('Huế')).toBe('Hue');
  expect(unaccent('Chợ Lớn')).toBe('Cho Lon');
  expect(unaccent('Đà Nẵng')).toBe('Da Nang');
  expect(unaccent('Gia Định')).toBe('Gia Dinh');
  // French, which is the other half of the corpus.
  expect(unaccent("CHÂTEAU D'EAU")).toBe("CHATEAU D'EAU");
  expect(unaccent('Cochinchine')).toBe('Cochinchine');
});

test('foldForSearch lowercases as well', () => {
  expect(foldForSearch('Sài Gòn')).toBe('sai gon');
  expect(foldForSearch('ĐÔ THÀNH')).toBe('do thanh');
});

test('a query typed without accents finds the accented name', () => {
  expect(matchesAllTerms('Sài Gòn - Việt Nam City Maps', 'sai gon')).toBe(true);
  expect(matchesAllTerms('Plan de la citadelle de Huế', 'hue')).toBe(true);
  expect(matchesAllTerms('Plan de Gia Định et des environs', 'gia dinh')).toBe(true);
  // and the accented query still finds it
  expect(matchesAllTerms('Sài Gòn - Việt Nam City Maps', 'Sài Gòn')).toBe(true);
});

test('every term must match, so extra words narrow instead of matching nothing', () => {
  const hay = 'Plan Cadastral de la ville de Saigon, Cochinchine Française 1882';
  expect(matchesAllTerms(hay, 'saigon 1882')).toBe(true);
  expect(matchesAllTerms(hay, 'saigon cadastral')).toBe(true);
  expect(matchesAllTerms(hay, 'saigon 1899')).toBe(false);
  // Order does not matter — terms, not a phrase.
  expect(matchesAllTerms(hay, '1882 cadastral')).toBe(true);
});

test('an empty query matches everything rather than nothing', () => {
  expect(matchesAllTerms('anything', '')).toBe(true);
  expect(matchesAllTerms('anything', '   ')).toBe(true);
});
