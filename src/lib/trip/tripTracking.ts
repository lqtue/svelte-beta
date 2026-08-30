/**
 * tripTracking.ts — GPS plumbing for /trip/[id]: permission pre-prompt,
 * walked-distance accumulation, and the proximity check that auto-completes
 * a "reach" stop.
 */
import type { StoryPoint } from '$lib/story/types';
import { haversineDistance } from '$lib/geo/geo';

export type PermissionResult = 'granted' | 'denied' | 'unavailable';

/**
 * Ask for a position once, in-context (tapping Start), so the browser prompt
 * appears with the trip on screen. Denial is never fatal — GpsTracker just
 * stays idle.
 */
export async function requestGeolocation(): Promise<PermissionResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unavailable';
  return await new Promise<PermissionResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (err) => resolve(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

/**
 * Sums consecutive position deltas, discarding jumps larger than
 * `maxJumpMeters` (a GPS spike, not a walk).
 */
export function createWalkTracker(maxJumpMeters = 80) {
  let last: [number, number] | null = null;
  let meters = 0;
  return {
    /** Feed a fix; returns the cumulative distance walked in metres. */
    push(pos: [number, number]): number {
      if (last) {
        const seg = haversineDistance(last, pos);
        if (seg < maxJumpMeters) meters += seg;
      }
      last = pos;
      return meters;
    },
    reset() {
      last = null;
      meters = 0;
    },
  };
}

/**
 * True when a fix is close enough to auto-check-in at `point`.
 * 'question' stops never auto-complete — they need an explicit answer.
 */
export function isWithinTrigger(pos: [number, number], point: StoryPoint): boolean {
  const kind = point.challenge?.type ?? 'none';
  if (kind === 'question') return false;
  const radius =
    kind === 'reach'
      ? (point.challenge?.triggerRadius ?? point.triggerRadius ?? 15)
      : (point.triggerRadius ?? 15);
  return haversineDistance(pos, point.coordinates) <= radius;
}
