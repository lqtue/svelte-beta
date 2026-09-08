/**
 * Pure checks for the OCR label rectangle (`Obb` in `$lib/core/geo/rectUtils`).
 *
 * A label is a rotated rectangle: centre, length along the text, thickness
 * across it, angle. The database keeps that rectangle (`rotation_deg`,
 * `label_w`, `label_h` — migration 076) *and* the axis-aligned box around it
 * (`global_*`), which every reader downstream still uses. So the round trip
 * matters: whatever the editor stores has to come back identical, at any angle.
 *
 * Every failure mode here still looks like a box on a map, and all of it is a
 * y-flip trap (image space is y-down, OL is y-up), so the numbers are asserted
 * rather than eyeballed.
 */
import { test, expect } from '@playwright/test';
import {
  foldAngle,
  labelStripSize,
  obbAabb,
  obbCorner,
  obbFromCornerDrag,
  obbFromRow,
  obbRing,
  obbToRow,
  ringCentre,
  rotationFromPointer,
  rotationHandlePoint,
  type Obb,
} from '../src/lib/core/geo/rectUtils';

const deg2rad = (d: number) => (d * Math.PI) / 180;
const obb = (over: Partial<Obb> = {}): Obb => ({ cx: 100, cy: 50, w: 200, h: 20, deg: 0, ...over });
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(b[0] - a[0], b[1] - a[1]);

test('the ring is closed, centred, and runs along the text', () => {
  const ring = obbRing(obb({ deg: 30 }));
  expect(ring).toHaveLength(5);
  expect(ring[0]).toEqual(ring[4]);
  const [cx, cy] = ringCentre(ring);
  expect(cx).toBeCloseTo(100, 6);
  expect(cy).toBeCloseTo(50, 6);
  // nw → ne is the length, ne → se the thickness.
  expect(dist(ring[0], ring[1])).toBeCloseTo(200, 6);
  expect(dist(ring[1], ring[2])).toBeCloseTo(20, 6);
  // OL space: y is flipped, so a positive (counter-clockwise) angle rises.
  expect(Math.atan2(ring[1][1] - ring[0][1], ring[1][0] - ring[0][0])).toBeCloseTo(deg2rad(30), 6);
});

test('the axis-aligned box contains the label and shares its centre', () => {
  const box = obbAabb(obb({ deg: 30 }));
  const c = Math.cos(deg2rad(30));
  const s = Math.sin(deg2rad(30));
  expect(box.w).toBeCloseTo(200 * c + 20 * s, 6);
  expect(box.h).toBeCloseTo(200 * s + 20 * c, 6);
  expect(box.x + box.w / 2).toBeCloseTo(100, 6);
  expect(box.y + box.h / 2).toBeCloseTo(50, 6);
});

test('a stored label comes back identical — at every angle, 45 included', () => {
  // This is what the two extra columns buy. Deriving the size from the box was
  // blind at 45 (a square box says nothing about which side is the lettering),
  // and any angle change rescaled the label.
  for (const deg of [0, 5, 30, 45, -45, 60, 89, 90]) {
    const before = obb({ deg });
    const back = obbFromRow(obbToRow(before));
    expect(back.cx, `${deg} deg`).toBeCloseTo(before.cx, 4);
    expect(back.cy, `${deg} deg`).toBeCloseTo(before.cy, 4);
    expect(back.w, `${deg} deg`).toBeCloseTo(before.w, 4);
    expect(back.h, `${deg} deg`).toBeCloseTo(before.h, 4);
    expect(back.deg, `${deg} deg`).toBeCloseTo(foldAngle(before.deg), 4);
  }
});

test('turning a label does not resize it', () => {
  const before = obb({ deg: 20 });
  const turned = obbFromRow(obbToRow({ ...before, deg: -70 }));
  expect(turned.w).toBeCloseTo(before.w, 4);
  expect(turned.h).toBeCloseTo(before.h, 4);
  expect(turned.deg).toBeCloseTo(-70, 4);
  // The box around it did have to change, and the centre did not.
  expect(obbAabb(turned).w).not.toBeCloseTo(obbAabb(before).w, 1);
  expect(turned.cx).toBeCloseTo(before.cx, 4);
});

test('a row the pipeline wrote has its size derived from the box', () => {
  // The OCR pipeline writes global_* + rotation_deg and no label size.
  const from = obb({ deg: 25 });
  const { global_x, global_y, global_w, global_h } = obbToRow(from);
  const derived = obbFromRow({ global_x, global_y, global_w, global_h, rotation_deg: 25 });
  expect(derived.w).toBeCloseTo(from.w, 3);
  expect(derived.h).toBeCloseTo(from.h, 3);
});

test('when the size cannot be derived, the box itself stands in', () => {
  // 45 deg: the inversion is singular, so there is nothing to recover.
  expect(labelStripSize(150, 150, 45)).toBeNull();
  const fallback = obbFromRow({
    global_x: 0,
    global_y: 0,
    global_w: 150,
    global_h: 150,
    rotation_deg: 45,
  });
  expect(fallback.w).toBeCloseTo(150, 6);
  expect(fallback.h).toBeCloseTo(150, 6);
  expect(fallback.deg).toBeCloseTo(45, 6);
  // A box the angle contradicts (wide and flat, but steeply rotated) too.
  expect(labelStripSize(400, 20, 70)).toBeNull();
});

test('a corner drag anchors the opposite corner', () => {
  const before = obb({ deg: 30 });
  const anchor = obbCorner(before, 'nw');
  const dragged = obbFromCornerDrag(before, 'se', obbCorner(before, 'se'));
  // Dropping a corner where it already is changes nothing.
  expect(dragged.w).toBeCloseTo(before.w, 6);
  expect(dragged.h).toBeCloseTo(before.h, 6);
  expect(dragged.cx).toBeCloseTo(before.cx, 6);
  // And after a real drag the anchor has not moved.
  const moved = obbFromCornerDrag(before, 'se', [400, 300]);
  const anchorAfter = obbCorner(moved, 'nw');
  expect(anchorAfter[0]).toBeCloseTo(anchor[0], 6);
  expect(anchorAfter[1]).toBeCloseTo(anchor[1], 6);
  expect(moved.deg).toBeCloseTo(before.deg, 6);
});

test('a corner drag resizes along the label, not along the screen', () => {
  // Pull the `se` corner 50 px further along the text direction only: the
  // length grows by 50 and the thickness is untouched. An axis-aligned editor
  // would have changed both.
  const before = obb({ deg: 30 });
  const [sx, sy] = obbCorner(before, 'se');
  const along = [Math.cos(deg2rad(30)), -Math.sin(deg2rad(30))];
  const moved = obbFromCornerDrag(before, 'se', [sx + 50 * along[0], sy + 50 * along[1]]);
  expect(moved.w).toBeCloseTo(250, 6);
  expect(moved.h).toBeCloseTo(20, 6);
});

test('dragging past the anchor flips instead of collapsing', () => {
  const before = obb({ deg: 0, w: 100, h: 40, cx: 0, cy: 0 });
  // `se` is at (50, 20); the anchor `nw` at (-50, -20). Drag well past it.
  const flipped = obbFromCornerDrag(before, 'se', [-150, -60]);
  expect(flipped.w).toBeCloseTo(100, 6);
  expect(flipped.h).toBeCloseTo(40, 6);
  expect(flipped.cx).toBeCloseTo(-100, 6); // on the far side of the anchor
  // And a corner dropped on the anchor keeps a minimum size rather than 0.
  const pinched = obbFromCornerDrag(before, 'se', [-50, -20]);
  expect(pinched.w).toBeGreaterThan(0);
  expect(pinched.h).toBeGreaterThan(0);
});

test('the turn handle sits past the end of the label, on its own axis', () => {
  const straight = rotationHandlePoint(obb({ deg: 0 }));
  expect(straight[0]).toBeGreaterThan(100 + 100); // clear of the end
  expect(straight[1]).toBeCloseTo(-50, 6); // still on the centre line
  // It comes back at the angle it was placed, so a drag starts where the label
  // points instead of jumping.
  for (const deg of [0, 20, -35, 45, 70, 90]) {
    const o = obb({ deg });
    expect(rotationFromPointer(o.cx, o.cy, rotationHandlePoint(o))).toBeCloseTo(foldAngle(deg), 6);
  }
});

test('dragging the turn handle up and to the right is a positive angle', () => {
  // Centre (50, 50) in image space sits at (50, -50) in OL space.
  expect(rotationFromPointer(50, 50, [150, -50])).toBeCloseTo(0, 6); // due right
  expect(rotationFromPointer(50, 50, [150, 50])).toBeCloseTo(45, 6); // up-right
  expect(rotationFromPointer(50, 50, [150, -150])).toBeCloseTo(-45, 6); // down-right
  expect(rotationFromPointer(50, 50, [50, 50])).toBeCloseTo(90, 6); // straight up
  // Dragging past vertical does not flip the label end over end.
  expect(rotationFromPointer(50, 50, [-50, 50])).toBeCloseTo(-45, 6);
});

test('folding keeps an angle in (-90, 90]', () => {
  expect(foldAngle(0)).toBe(0);
  expect(foldAngle(90)).toBe(90);
  expect(foldAngle(91)).toBeCloseTo(-89, 6);
  expect(foldAngle(175)).toBeCloseTo(-5, 6);
  expect(foldAngle(180)).toBe(0);
  expect(foldAngle(-100)).toBeCloseTo(80, 6);
  expect(foldAngle(370)).toBeCloseTo(10, 6);
});
