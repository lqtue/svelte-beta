/**
 * saigonSeed.ts — the "Walk around central Saigon" sample story.
 *
 * Seeded into a new user's library exactly once per seed version so the
 * editor is never empty on first visit. Bumping SAIGON_SEED_KEY (v2 → v3)
 * re-seeds everyone on their next visit; any prior copy (matched by title) is
 * removed first, so the user ends up with exactly one up-to-date example.
 */
import type { MapListItem } from '$lib/map/types';
import type { PointChallenge, Story } from '$lib/story/types';
import { createStoryDraft } from '$lib/story/pointOps';
import type { StoryLibraryStore } from '$lib/story/stores/storyStore';

export const SAIGON_SEED_KEY = 'vma-create-saigon-seeded-v2';
export const SAIGON_SEED_TITLE = 'Walk around central Saigon';

const SAIGON_SEED_DESCRIPTION =
  'Five landmarks of colonial-era District 1 — try Question and Reach challenges as you go.';

/** Central District 1 — used to pick a historical layer that covers the walk. */
const SAIGON_CENTER: [number, number] = [106.6988, 10.7787];

interface SamplePoint {
  title: string;
  description: string;
  lon: number;
  lat: number;
  challenge: PointChallenge;
}

const SAIGON_SAMPLE_POINTS: SamplePoint[] = [
  {
    title: 'Notre-Dame Cathedral',
    description: 'Neo-Romanesque cathedral built 1877–1880 with bricks shipped from Marseille.',
    lon: 106.69906,
    lat: 10.77983,
    challenge: { type: 'none' },
  },
  {
    title: 'Central Post Office',
    description: 'Opened 1891 in the French Indochina style next to the cathedral.',
    lon: 106.69963,
    lat: 10.77996,
    challenge: {
      type: 'question',
      question: "Which famous engineer's firm is often credited with this building?",
      answer: 'Eiffel',
    },
  },
  {
    title: 'Independence Palace',
    description: 'Rebuilt 1962–1966 on the site of the former Norodom Palace.',
    lon: 106.6953,
    lat: 10.777,
    challenge: {
      type: 'question',
      question: 'In which year did this site mark the end of the war?',
      answer: '1975',
    },
  },
  {
    title: 'Saigon Opera House',
    description: 'Beaux-Arts theatre opened 1900 on the former Rue Catinat.',
    lon: 106.7037,
    lat: 10.7765,
    challenge: { type: 'reach', triggerRadius: 30 },
  },
  {
    title: 'Bến Thành Market',
    description: 'Iconic four-gate covered market relocated here in 1914.',
    lon: 106.6983,
    lat: 10.7726,
    challenge: { type: 'reach', triggerRadius: 25 },
  },
];

/** The first georeferenced map whose bbox covers central Saigon, else any. */
export function pickSaigonHistoricalMap(mapList: MapListItem[]): MapListItem | null {
  const [lng, lat] = SAIGON_CENTER;
  const containsSaigon = (m: MapListItem) => {
    const bb = m.bounds ?? m.bbox;
    if (!bb) return false;
    const [w, s, e, n] = bb;
    return lng >= w && lng <= e && lat >= s && lat <= n;
  };
  return (
    mapList.find((m) => (m.allmaps_id || m.annotation_url) && containsSaigon(m)) ??
    mapList.find((m) => m.allmaps_id || m.annotation_url) ??
    null
  );
}

/** True when this browser has not yet been seeded for the current seed version. */
export function needsSaigonSeed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !localStorage.getItem(SAIGON_SEED_KEY);
  } catch {
    return false;
  }
}

/** Build the sample story, pinning every point to a historical Saigon layer. */
export function buildSaigonExample(mapList: MapListItem[], authorId: string): Story {
  const overlayMapId = pickSaigonHistoricalMap(mapList)?.id ?? undefined;
  const story = createStoryDraft(authorId, SAIGON_SEED_TITLE, SAIGON_SEED_DESCRIPTION);
  story.points = SAIGON_SAMPLE_POINTS.map((p, i) => ({
    id: crypto.randomUUID(),
    order: i,
    title: p.title,
    description: p.description,
    coordinates: [p.lon, p.lat] as [number, number],
    triggerRadius: p.challenge.type === 'reach' ? (p.challenge.triggerRadius ?? 15) : 15,
    interaction: 'proximity' as const,
    challenge: p.challenge,
    overlayMapId,
  }));
  return story;
}

/**
 * Mark this browser seeded, drop any stale copy of the example, then append a
 * fresh one. Writes straight to the library — the user stays on the library
 * screen rather than being hijacked into the editor.
 */
export function seedSaigonExample(
  storyLibrary: StoryLibraryStore,
  mapList: MapListItem[],
  authorId: string
): void {
  try {
    localStorage.setItem(SAIGON_SEED_KEY, '1');
  } catch {}
  const story = buildSaigonExample(mapList, authorId);
  storyLibrary.update((lib) => ({
    stories: [...lib.stories.filter((s) => s.title !== SAIGON_SEED_TITLE), story],
  }));
}
