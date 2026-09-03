import { expect, test } from '@playwright/test';
import { tweenValue } from '../src/lib/core/utils/tween';

/**
 * Pure checks for the opacity tween that replaced animejs in the studio
 * timeline. No clock, no browser — `tweenValue` is the whole interpolation.
 */

test('a tween starts where it starts and ends where it ends', () => {
  expect(tweenValue(0.2, 0.9, 0)).toBeCloseTo(0.2, 6);
  expect(tweenValue(0.2, 0.9, 1)).toBeCloseTo(0.9, 6);
});

test('the midpoint is halfway, and the curve eases either side of it', () => {
  expect(tweenValue(0, 1, 0.5)).toBeCloseTo(0.5, 6);
  // Cubic ease-in-out: slower than linear early, faster than linear late.
  expect(tweenValue(0, 1, 0.25)).toBeLessThan(0.25);
  expect(tweenValue(0, 1, 0.75)).toBeGreaterThan(0.75);
});

test('it fades down as readily as up, and never overshoots', () => {
  expect(tweenValue(1, 0, 0.5)).toBeCloseTo(0.5, 6);
  for (const t of [0, 0.1, 0.33, 0.5, 0.9, 1]) {
    const v = tweenValue(0.3, 0.8, t);
    expect(v).toBeGreaterThanOrEqual(0.3);
    expect(v).toBeLessThanOrEqual(0.8);
  }
});

test('progress outside 0 to 1 is clamped rather than extrapolated', () => {
  expect(tweenValue(0, 1, -5)).toBe(0);
  expect(tweenValue(0, 1, 5)).toBe(1);
});
