/**
 * Pure checks for the OCR review keyboard loop (`ocrReviewController`).
 * Browser-less; they ride the Playwright runner.
 *
 * The two things worth a test: `step` walks the rows the sidebar *shows*, in
 * its order, and wraps — an off-by-one here silently skips a label in a
 * hundred-label sheet — and `setStatus` toggles rather than re-writing, so
 * pressing `v` twice does not leave a row validated.
 */
import { expect, test } from '@playwright/test';
import { get } from 'svelte/store';
import { createOcrReview } from '../src/lib/features/contribute/ocr/ocrReviewController';
import type { OcrExtraction } from '../src/lib/features/contribute/shared/types';
import type { OcrStatus } from '../src/lib/features/contribute/shared/ocrApi';

const row = (id: string, status: OcrStatus = 'pending') =>
  ({
    id,
    global_x: 0,
    global_y: 0,
    global_w: 10,
    global_h: 10,
    category: 'other',
    text: id,
    text_validated: null,
    category_validated: null,
    confidence: 0.9,
    status,
  }) as OcrExtraction;

function harness(rows: OcrExtraction[], visible = rows) {
  const writes: [string, OcrStatus][] = [];
  const focused: [string, boolean | undefined][] = [];
  const review = createOcrReview({
    getMapId: () => 'map-1',
    getRunId: () => 'run-1',
    reload: () => {},
    focusRow: (id, focusInput) => focused.push([id, focusInput]),
    fitTo: () => {},
    panTo: () => {},
    setRowStatus: (id, status) => {
      writes.push([id, status]);
    },
  });
  review.loaded({ detail: { extractions: rows } } as CustomEvent<{
    extractions: OcrExtraction[];
  }>);
  review.filter({ detail: { extractions: visible } } as CustomEvent<{
    extractions: OcrExtraction[];
  }>);
  return { review, writes, focused, at: () => get(review).selectedId };
}

test('stepping walks the shown rows and wraps at both ends', () => {
  const { review, at } = harness([row('a'), row('b'), row('c')]);
  review.step(1);
  expect(at()).toBe('a');
  review.step(1);
  expect(at()).toBe('b');
  review.step(-1);
  expect(at()).toBe('a');
  review.step(-1);
  expect(at()).toBe('c'); // wrapped backwards off the top
  review.step(1);
  expect(at()).toBe('a');
});

test('stepping ignores rows the filters hide', () => {
  const rows = [row('a'), row('b'), row('c')];
  const { review, at } = harness(rows, [rows[0], rows[2]]);
  review.step(1);
  review.step(1);
  expect(at()).toBe('c');
});

test('stepping never focuses the sidebar input — the keys must keep working', () => {
  const { review, focused } = harness([row('a'), row('b')]);
  review.step(1);
  expect(focused).toEqual([['a', false]]);
});

test('a click selects without focusing the input — shortcuts must keep firing', () => {
  // Focusing the row's text field on select made every shortcut type a
  // character instead: `r` wrote "r" into the label. `e` is how you get there.
  const { review, focused, at } = harness([row('a'), row('b')]);
  review.select({ detail: { id: 'b' } } as CustomEvent<{ id: string }>);
  expect(at()).toBe('b');
  expect(focused).toEqual([['b', false]]);
});

test('validate writes through the sidebar and advances to the next row', () => {
  const { review, writes, at } = harness([row('a'), row('b')]);
  review.step(1);
  review.setStatus('validated', true);
  expect(writes).toEqual([['a', 'validated']]);
  expect(at()).toBe('b');
});

test('the same status twice puts the row back to pending', () => {
  const { review, writes } = harness([row('a', 'validated'), row('b')]);
  review.step(1);
  review.setStatus('validated');
  expect(writes).toEqual([['a', 'pending']]);
  expect(get(review).extractions[0].status).toBe('pending');
});

test('a reload keeps the selection when the row survived it', () => {
  const rows = [row('a'), row('b')];
  const { review, at } = harness(rows);
  review.step(1);
  review.loaded({ detail: { extractions: rows } } as CustomEvent<{
    extractions: OcrExtraction[];
  }>);
  expect(at()).toBe('a');
  review.loaded({ detail: { extractions: [rows[1]] } } as CustomEvent<{
    extractions: OcrExtraction[];
  }>);
  expect(at()).toBeNull();
});
