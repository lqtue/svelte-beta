import { test, expect } from '@playwright/test';
import { baselineChord } from '../src/lib/core/geo/rectUtils';

// `global_*` is the axis-aligned bounding box of text that may run at any angle,
// and `rotation_deg` is the only record of which way. These assert the chord the
// box implies, because a sign slip there paints the baseline across the label
// instead of along it — and it would still look like a line, so nothing else
// would catch it.

test('a horizontal label gets no baseline — the box already reads right', () => {
  expect(baselineChord(0, 0, 100, 20, 0)).toBeNull();
  expect(baselineChord(0, 0, 100, 20, 4)).toBeNull();
  expect(baselineChord(0, 0, 100, 20, null)).toBeNull();
  expect(baselineChord(0, 0, 100, 20, undefined)).toBeNull();
  // A baseline is a line, not a direction: 178 deg is near-horizontal too.
  expect(baselineChord(0, 0, 100, 20, 178)).toBeNull();
});

test('a degenerate box gets no baseline', () => {
  expect(baselineChord(0, 0, 0, 20, 45)).toBeNull();
  expect(baselineChord(0, 0, 100, 0, 45)).toBeNull();
  expect(baselineChord(0, 0, 100, 20, NaN)).toBeNull();
});

test('45 deg across a square box runs corner to corner, and rises on screen', () => {
  const chord = baselineChord(0, 0, 100, 100, 45)!;
  expect(chord).not.toBeNull();
  const [[x0, y0], [x1, y1]] = chord;
  // Corner to corner of the box, in OL space (y already flipped).
  expect(x0).toBeCloseTo(0, 6);
  expect(y0).toBeCloseTo(-100, 6);
  expect(x1).toBeCloseTo(100, 6);
  expect(y1).toBeCloseTo(0, 6);
  // Positive angle = counter-clockwise on screen: y rises as x does.
  expect(y1).toBeGreaterThan(y0);
});

test('a negative angle falls as x rises', () => {
  const [[, y0], [, y1]] = baselineChord(0, 0, 100, 100, -45)!;
  expect(y1).toBeLessThan(y0);
});

test('the chord is the shorter crossing, so it stays inside the box', () => {
  // Wide box, steep text: the top and bottom edges cut the chord short.
  const [[x0, y0], [x1, y1]] = baselineChord(0, 0, 400, 40, 60)!;
  for (const [x, y] of [
    [x0, y0],
    [x1, y1],
  ]) {
    expect(x).toBeGreaterThanOrEqual(-1e-6);
    expect(x).toBeLessThanOrEqual(400 + 1e-6);
    expect(-y).toBeGreaterThanOrEqual(-1e-6);
    expect(-y).toBeLessThanOrEqual(40 + 1e-6);
  }
  // It touches both of the sides it left first — half-height / sin(60).
  expect(Math.hypot(x1 - x0, y1 - y0)).toBeCloseTo(40 / Math.sin((60 * Math.PI) / 180), 6);
});

test('the chord is centred on the box, whatever the angle', () => {
  for (const deg of [10, 30, 45, 60, 89, 90, 120, -35]) {
    const [[x0, y0], [x1, y1]] = baselineChord(50, 70, 300, 120, deg)!;
    expect((x0 + x1) / 2).toBeCloseTo(50 + 150, 6);
    expect((y0 + y1) / 2).toBeCloseTo(-(70 + 60), 6);
  }
});

test('vertical text runs the height of the box', () => {
  const [[x0, y0], [x1, y1]] = baselineChord(0, 0, 40, 300, 90)!;
  expect(Math.abs(x1 - x0)).toBeCloseTo(0, 6);
  expect(Math.abs(y1 - y0)).toBeCloseTo(300, 6);
});
