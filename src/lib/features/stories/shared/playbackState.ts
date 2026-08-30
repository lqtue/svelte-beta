/**
 * playbackState.ts — pure derivations shared by the two story players
 * (`StoryPlayback` on desktop/preview, `TripPlayback` on mobile).
 */
import type { PointChallenge, Story, StoryPoint, StoryProgress } from './types';

export type AnswerStatus = 'idle' | 'wrong' | 'right';

export interface PlaybackState {
  currentIndex: number;
  completedIds: Set<string>;
  currentPoint: StoryPoint | null;
  isFinished: boolean;
  total: number;
  progressFraction: number;
}

export function derivePlaybackState(
  story: Story | null,
  progress: StoryProgress | null
): PlaybackState {
  const points = story?.points ?? [];
  const total = points.length;
  const currentIndex = progress?.currentPointIndex ?? 0;
  const completedIds = new Set(progress?.completedPoints ?? []);
  return {
    currentIndex,
    completedIds,
    currentPoint: currentIndex < total ? points[currentIndex] : null,
    isFinished: !!story && currentIndex >= total,
    total,
    progressFraction: total > 0 ? completedIds.size / total : 0,
  };
}

/** Case-insensitive answer check. An empty expected answer accepts anything. */
export function checkAnswer(challenge: PointChallenge | undefined, draft: string): boolean {
  const expected = (challenge?.answer ?? '').trim().toLowerCase();
  return !expected || draft.trim().toLowerCase() === expected;
}

/**
 * Tracks which point the challenge UI is currently showing, so a player can
 * reset its answer draft exactly once per point change:
 *
 *   const answerGate = createAnswerGate();
 *   $: if (answerGate.changed(currentPoint)) { answerDraft = ''; answerStatus = 'idle'; }
 */
export function createAnswerGate() {
  let lastPointId: string | null = null;
  return {
    changed(point: StoryPoint | null): boolean {
      if (!point || point.id === lastPointId) return false;
      lastPointId = point.id;
      return true;
    },
  };
}
