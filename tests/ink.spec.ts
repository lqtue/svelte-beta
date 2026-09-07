/**
 * ink.spec.ts — the canvas palette's one piece of arithmetic.
 *
 * `inkAlpha` parses a hex ink into the `rgba()` string OpenLayers wants, and
 * `featureTypeFill` is now a thin call over it. A silent failure here is a
 * draw style that paints the wrong colour or nothing at all, which is the kind
 * of thing nobody notices until a footprint is invisible on the sheet.
 */
import { test, expect } from '@playwright/test';

import { INK, inkAlpha } from '../src/lib/core/ink';
import { featureTypeFill, FEATURE_TYPE_COLORS } from '../src/lib/data/maps/footprintTypes';

test('an ink at partial strength keeps its channels', () => {
  expect(inkAlpha('#1a1a17', 0.5)).toBe('rgba(26, 26, 23, 0.5)');
  // Every channel is read, including a leading zero and a full byte.
  expect(inkAlpha('#00ff80', 1)).toBe('rgba(0, 255, 128, 1)');
});

test('a footprint fill is its type colour, thinned', () => {
  const green = INK.green.slice(1);
  const n = parseInt(green, 16);
  const rgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  expect(FEATURE_TYPE_COLORS.building).toBe(INK.green);
  expect(featureTypeFill('building')).toBe(`rgba(${rgb}, 0.35)`);
});

test('an unknown feature type falls back rather than painting nothing', () => {
  expect(featureTypeFill('not_a_type')).toBe(featureTypeFill('other'));
});
