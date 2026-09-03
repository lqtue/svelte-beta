/**
 * tween.ts — the easing curve and the one interpolation the studio timeline
 * needs, with no OpenLayers or DOM in sight so it can be checked directly.
 *
 * ponytail: this is what replaced `animejs`, which was a dependency carried for
 * exactly one job — walking a layer's opacity from one value to another. The
 * ceiling is deliberate: no stagger, no keyframe sequencing, no spring. If the
 * timeline ever needs those, take a library back rather than growing this.
 */

/** Cubic ease-in-out. Also handed to OpenLayers' `view.animate` so the camera and the layers share one curve. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** The eased value at progress `t`. Progress outside 0→1 is clamped, never extrapolated. */
export function tweenValue(from: number, to: number, t: number): number {
  return from + (to - from) * easeInOutCubic(Math.min(1, Math.max(0, t)));
}
