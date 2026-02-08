# Treasure Hunt / Story Walk — Planning Document

## Overview

A GPS-driven treasure hunt system built on top of the existing Studio. Creators design hunts by placing stops on the map with quests and interaction requirements. Players walk the route in real life, triggering stops by proximity (10m), QR code scanning, or camera capture.

Two distinct modes sharing the same data model:
- **Hunt Creator** — extension of Studio for designing hunts
- **Hunt Player** — standalone lightweight route for walking the hunt

---

## Data Model

### Types (added to `src/lib/viewer/types.ts`)

```typescript
// Interaction type determines how a stop is "completed"
export type StopInteraction = 'proximity' | 'qr' | 'camera';

export type HuntDifficulty = 'easy' | 'medium' | 'hard';

export interface HuntStop {
  id: string;                    // randomId('stop')
  order: number;                 // 0-indexed display/walk order
  title: string;                 // "The Old Cathedral"
  description: string;           // Rich text shown when stop is reached
  hint?: string;                 // Optional hint shown before arrival
  quest?: string;                // Task/question text ("Find the year on the plaque")
  coordinates: [number, number]; // [lon, lat] EPSG:4326
  triggerRadius: number;         // meters, default 10
  interaction: StopInteraction;  // how this stop is completed
  qrPayload?: string;           // unique string encoded in the QR code
  media?: HuntMedia[];           // images/videos shown at the stop
  overlayMapId?: string;         // optional historical map overlay for this stop
}

export interface HuntMedia {
  type: 'image' | 'video';
  url: string;                   // data URL or remote URL
  caption?: string;
}

export interface TreasureHunt {
  id: string;                    // randomId('hunt')
  title: string;
  description: string;
  difficulty: HuntDifficulty;
  stops: HuntStop[];
  region?: {                     // bounding box for the hunt area
    center: [number, number];    // [lon, lat]
    zoom: number;
  };
  createdAt: number;             // Date.now()
  updatedAt: number;
}

export interface HuntProgress {
  huntId: string;
  currentStopIndex: number;      // which stop the player is walking to
  completedStops: string[];      // stop IDs that have been completed
  startedAt: number;
  completedAt?: number;          // set when all stops done
  log: HuntLogEntry[];           // timestamped activity log
}

export interface HuntLogEntry {
  stopId: string;
  action: 'arrived' | 'scanned' | 'captured' | 'skipped';
  timestamp: number;
  data?: string;                 // QR payload or image data URL
}
```

### Storage

| Key | Format | Purpose |
|-----|--------|---------|
| `vma-hunts-v1` | `TreasureHunt[]` | All created hunts |
| `vma-hunt-progress-v1` | `Record<string, HuntProgress>` | Player progress per hunt |

Separate from existing `vma-viewer-state-v1` to avoid bloating the Studio state.

### Sharing

Hunts are exported/imported as self-contained JSON files:
```json
{
  "format": "vma-treasure-hunt",
  "version": 1,
  "hunt": { ... }
}
```

Future: URL-based sharing via encoded parameter or short-link service.

---

## Phase 1 — Hunt Creator (Studio Extension)

### Goal
Add a "Hunts" mode to the Studio where creators can design treasure hunts by placing stops on the map, ordering them, and configuring interaction types.

### New Files

```
src/lib/hunt/
├── types.ts              — Re-exports hunt types from viewer/types.ts (or define here)
├── stores/
│   └── huntStore.ts      — Svelte writable store for hunts CRUD + persistence
├── utils/
│   ├── geo.ts            — Haversine distance, bearing, coordinate utils
│   └── qr.ts             — QR code generation (Phase 3, stub for now)
├── HuntCreator.svelte    — Main creator panel (replaces AnnotationsPanel when in hunt mode)
├── StopEditor.svelte     — Single stop editing card (inline in the list)
├── StopList.svelte       — Ordered list of stops with drag-to-reorder
└── HuntSettings.svelte   — Hunt title, description, difficulty, export/import
```

### Modified Files

| File | Change |
|------|--------|
| `src/lib/viewer/types.ts` | Add hunt-related type definitions |
| `src/lib/studio/Studio.svelte` | Add hunt mode toggle, swap right panel between AnnotationsPanel and HuntCreator |
| `src/lib/studio/StudioToolbar.svelte` | Add "Hunt mode" button to toggle |
| `src/lib/studio/StudioMap.svelte` | Add hunt stop layer + interactions (place stops by clicking, numbered markers) |

### Hunt Creator UX Flow

1. User clicks "Hunt mode" button in toolbar — right panel switches to HuntCreator
2. Click on map places a new stop (numbered marker appears)
3. Stop card appears in the list with fields: title, description, hint, interaction type
4. Drag stops in the list to reorder (updates `order` field and marker numbers)
5. Click a stop in the list to select it on the map (zoom to it)
6. Click a stop marker on the map to select it in the list
7. "Export Hunt" saves a `.json` file; "Import Hunt" loads one
8. Stops are persisted to `vma-hunts-v1` localStorage on every change (debounced)

### Hunt Stop Markers (Visual)

Numbered circle markers on the map, distinct from regular annotations:
- Gold circle with white number: `1`, `2`, `3`...
- Selected stop: larger circle with gold ring
- Connected by a dashed gold polyline showing the walk route
- Different icon overlays per interaction type:
  - Proximity: footprint icon
  - QR: QR square icon
  - Camera: camera icon (greyed out until Phase 4)

### StudioMap Additions

New exported functions:
```typescript
export function addHuntStopLayer(): void           // Initialize hunt vector layer
export function setHuntStops(stops: HuntStop[]): void  // Render stops as numbered features
export function clearHuntStops(): void
export function getHuntStopAtPixel(pixel): string | null  // Hit detection
export function addHuntRouteLayer(): void          // Dashed polyline connecting stops
```

New vector layer (`zIndex: 30`) with custom style function for numbered markers.
Route layer (`zIndex: 29`) with dashed gold line style.

### Hunt Store (`huntStore.ts`)

```typescript
import { writable } from 'svelte/store';

const HUNTS_KEY = 'vma-hunts-v1';

interface HuntStoreValue {
  hunts: TreasureHunt[];
  activeHuntId: string | null;  // currently being edited
}

export function createHuntStore() {
  // Load from localStorage
  // Methods: createHunt, updateHunt, deleteHunt, addStop, updateStop,
  //          removeStop, reorderStops, setActiveHunt, exportHunt, importHunt
  // Auto-persist on change (debounced 500ms)
}
```

### Geo Utilities (`geo.ts`)

```typescript
/** Haversine distance in meters between two [lon, lat] points */
export function haversineDistance(a: [number, number], b: [number, number]): number;

/** Bearing from point A to point B in degrees */
export function bearing(a: [number, number], b: [number, number]): number;

/** Total route distance in meters for an array of [lon, lat] points */
export function routeDistance(points: [number, number][]): number;

/** Check if a point is within radius (meters) of a target */
export function isWithinRadius(
  point: [number, number],
  target: [number, number],
  radiusMeters: number
): boolean;
```

---

## Phase 2 — Hunt Player (GPS Tracking + Proximity)

### Goal
A standalone player experience at `/hunt/[id]` where users walk the route. GPS tracks their position, and stops trigger when within 10m.

### New Files

```
src/routes/hunt/
├── +page.svelte          — Hunt selection / list page
└── [id]/
    └── +page.svelte      — Active hunt player

src/lib/hunt/
├── HuntPlayer.svelte     — Main player component (map + UI overlay)
├── HuntPlayerMap.svelte   — Simplified OL map for player (no drawing tools)
├── StopCard.svelte       — Stop reveal card (shown when stop is reached)
├── ProgressBar.svelte    — Visual progress indicator
├── DistanceIndicator.svelte — "42m to next stop" with compass arrow
└── stores/
    └── huntProgress.ts   — Player progress store + persistence
```

### Player UX Flow

1. Player opens `/hunt` — sees list of available hunts (from localStorage or imported)
2. Selects a hunt — navigates to `/hunt/[id]`
3. Map loads centered on the hunt region
4. Player's position shown as a pulsing blue dot (GPS `watchPosition`)
5. Next stop shown as a gold marker with distance indicator
6. As player walks, distance updates in real-time
7. When within 10m of a proximity stop → stop triggers:
   - Vibration feedback (`navigator.vibrate`)
   - Stop card slides up with title, description, quest
   - Player taps "Found it!" to mark complete
8. For QR stops: card says "Scan the QR code" → opens scanner
9. Progress bar updates, route line greys out completed segments
10. All stops complete → celebration screen with stats (time, distance)

### GPS Tracking

```typescript
// In HuntPlayerMap.svelte
let watchId: number | null = null;
let userPosition: [number, number] | null = null;  // [lon, lat]
let positionAccuracy: number = 0;

function startTracking() {
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      userPosition = [pos.coords.longitude, pos.coords.latitude];
      positionAccuracy = pos.coords.accuracy;
      checkProximity();
    },
    (err) => { /* handle denial / timeout */ },
    {
      enableHighAccuracy: true,
      maximumAge: 2000,       // accept cached positions up to 2s old
      timeout: 10000
    }
  );
}
```

### Proximity Detection (10m geofence)

```typescript
let consecutiveInRange = 0;
const TRIGGER_THRESHOLD = 2;  // require 2+ readings to avoid GPS jitter

function checkProximity() {
  if (!userPosition) return;
  const currentStop = hunt.stops[progress.currentStopIndex];
  if (!currentStop || currentStop.interaction !== 'proximity') return;

  const distance = haversineDistance(userPosition, currentStop.coordinates);

  if (distance <= currentStop.triggerRadius) {
    consecutiveInRange++;
    if (consecutiveInRange >= TRIGGER_THRESHOLD) {
      triggerStopArrival(currentStop);
      consecutiveInRange = 0;
    }
  } else {
    consecutiveInRange = 0;
  }
}
```

### Player Map (Simplified)

Reuses OpenLayers but stripped down:
- Basemap only (no warped overlay — unless the stop has `overlayMapId`)
- User position layer (pulsing blue dot)
- Hunt stops layer (numbered markers, completed ones greyed out)
- Route line layer
- No drawing tools, no annotation layer
- Optional: show historical map overlay per-stop for "then vs now" effect

### Progress Store

```typescript
const PROGRESS_KEY = 'vma-hunt-progress-v1';

export function createHuntProgressStore(huntId: string) {
  // Load existing progress or create new
  // Methods: markStopComplete, skipStop, reset, getStats
  // Auto-persist
}
```

---

## Phase 3 — QR Code Interaction

### Goal
Creator generates unique QR codes per stop. Player scans QR at the physical location to complete that stop.

### New Dependencies

```bash
npm install qrcode        # QR code generation (creator side)
```

No npm dependency needed for scanning — use native `BarcodeDetector` API with `jsQR` fallback.

### New Files

```
src/lib/hunt/
├── utils/
│   └── qr.ts             — Generate QR code as data URL, validate payloads
├── QrGenerator.svelte    — Creator: generates printable QR for a stop
├── QrScanner.svelte      — Player: camera-based QR scanner overlay
```

### QR Payload Format

```
vma:hunt:{huntId}:stop:{stopId}:secret:{8-char-random}
```

Example: `vma:hunt:hunt-abc123:stop:stop-def456:secret:x9k2m4p7`

The `secret` is generated once when the stop is created and stored in `qrPayload`. This prevents someone from just guessing stop IDs.

### QR Generator (Creator Side)

```typescript
// In qr.ts
import QRCode from 'qrcode';

export async function generateQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: 300,
    margin: 2,
    color: { dark: '#2b2520', light: '#f4e8d8' }  // match theme
  });
}

export function generateQrPayload(huntId: string, stopId: string): string {
  const secret = shortId();
  return `vma:hunt:${huntId}:stop:${stopId}:secret:${secret}`;
}

export function parseQrPayload(raw: string): { huntId: string; stopId: string; secret: string } | null {
  const match = raw.match(/^vma:hunt:(.+):stop:(.+):secret:(.+)$/);
  if (!match) return null;
  return { huntId: match[1], stopId: match[2], secret: match[3] };
}
```

### QR Scanner (Player Side)

```typescript
// Uses BarcodeDetector API (Chrome/Edge/Safari) with jsQR fallback
// Camera stream via navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
// Scans every 200ms from video frame to canvas
// On valid QR: vibrate, show success, mark stop complete
// Validates: payload matches expected huntId + stopId + secret
```

### Creator UX

In StopEditor, when interaction type is "QR":
1. QR payload is auto-generated on stop creation
2. "Generate QR" button renders the QR as an image
3. "Download QR" saves a printable PNG (with stop title as label below)
4. "Print All QRs" batch-generates a printable sheet for all QR stops

### Player UX

When a QR stop is reached (within proximity OR manually triggered):
1. Card appears: "Scan the QR code to complete this stop"
2. "Open Scanner" button activates camera overlay
3. Camera feed shown with scanning frame
4. On valid scan: green checkmark animation, stop marked complete
5. On invalid scan: "Wrong QR code" shake animation
6. "Cancel" closes scanner

---

## Phase 4 — Camera Capture Interaction (Future)

### Goal
Stops that require the player to take a photo as proof of completion. Photo is stored locally and shown in the hunt log.

### New Files

```
src/lib/hunt/
├── CameraCapture.svelte  — Camera viewfinder + capture button
└── PhotoGallery.svelte   — View captured photos in hunt log
```

### Implementation

```typescript
// Camera access (reuses same getUserMedia from QR scanner)
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
});

// Capture frame to canvas → data URL
function capturePhoto(): string {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')!.drawImage(video, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.8);
}
```

### Storage

Photos stored as data URLs in `HuntLogEntry.data`. For hunts with many photos, consider IndexedDB instead of localStorage to avoid the ~5MB limit.

### Player UX

1. At a camera stop, card shows: "Take a photo of [quest description]"
2. Camera viewfinder opens (full screen overlay)
3. Player takes photo → preview shown
4. "Use this photo" / "Retake" buttons
5. On confirm: photo saved to log, stop marked complete

---

## Route Structure

```
/hunt                     — Hunt browser (list of available hunts)
/hunt/[id]                — Active hunt player
/hunt/create              — (Future) Standalone creator without full Studio
```

For now, hunt creation happens inside Studio (`/temp-viewer`) via the HuntCreator panel.

---

## File Tree Summary (All Phases)

```
src/lib/hunt/
├── types.ts                    — Phase 1
├── stores/
│   ├── huntStore.ts            — Phase 1 (creator persistence)
│   └── huntProgress.ts         — Phase 2 (player persistence)
├── utils/
│   ├── geo.ts                  — Phase 1 (distance, bearing)
│   └── qr.ts                   — Phase 3 (generate, parse, validate)
├── HuntCreator.svelte          — Phase 1 (creator right panel)
├── StopEditor.svelte           — Phase 1 (stop editing card)
├── StopList.svelte             — Phase 1 (ordered stop list)
├── HuntSettings.svelte         — Phase 1 (hunt metadata + export)
├── HuntPlayer.svelte           — Phase 2 (player root component)
├── HuntPlayerMap.svelte        — Phase 2 (simplified OL map)
├── StopCard.svelte             — Phase 2 (stop reveal UI)
├── ProgressBar.svelte          — Phase 2 (visual progress)
├── DistanceIndicator.svelte    — Phase 2 (distance + compass)
├── QrGenerator.svelte          — Phase 3 (creator QR preview)
├── QrScanner.svelte            — Phase 3 (player QR camera)
├── CameraCapture.svelte        — Phase 4 (photo proof)
└── PhotoGallery.svelte         — Phase 4 (photo log viewer)

src/routes/hunt/
├── +page.svelte                — Phase 2 (hunt list)
└── [id]/
    └── +page.svelte            — Phase 2 (player route)
```

### Modified Existing Files

| File | Phase | Change |
|------|-------|--------|
| `src/lib/viewer/types.ts` | 1 | Add hunt type definitions |
| `src/lib/studio/Studio.svelte` | 1 | Hunt mode toggle, panel switching |
| `src/lib/studio/StudioToolbar.svelte` | 1 | Hunt mode button |
| `src/lib/studio/StudioMap.svelte` | 1 | Hunt stop layer, route line, click-to-place |
| `package.json` | 3 | Add `qrcode` dependency |

---

## Implementation Order

### Phase 1: Hunt Creator
1. Add types to `src/lib/viewer/types.ts`
2. Create `src/lib/hunt/utils/geo.ts` (Haversine + helpers)
3. Create `src/lib/hunt/stores/huntStore.ts` (CRUD + localStorage)
4. Create `StopEditor.svelte` (single stop card)
5. Create `StopList.svelte` (ordered list with reorder)
6. Create `HuntSettings.svelte` (metadata + export/import)
7. Create `HuntCreator.svelte` (assembles the above)
8. Modify `StudioMap.svelte` (hunt stop layer + route line + click-to-place)
9. Modify `StudioToolbar.svelte` (hunt mode toggle)
10. Modify `Studio.svelte` (hunt mode state, panel switching)

### Phase 2: Hunt Player
1. Create `src/lib/hunt/stores/huntProgress.ts`
2. Create `HuntPlayerMap.svelte` (simplified OL map + GPS tracking)
3. Create `DistanceIndicator.svelte`
4. Create `ProgressBar.svelte`
5. Create `StopCard.svelte`
6. Create `HuntPlayer.svelte` (assembles player UI)
7. Create `/hunt/+page.svelte` (hunt browser)
8. Create `/hunt/[id]/+page.svelte` (player route)

### Phase 3: QR Interaction
1. Install `qrcode` package
2. Create `src/lib/hunt/utils/qr.ts`
3. Create `QrGenerator.svelte`
4. Create `QrScanner.svelte`
5. Integrate into StopEditor (creator) and StopCard (player)

### Phase 4: Camera Capture
1. Create `CameraCapture.svelte`
2. Create `PhotoGallery.svelte`
3. Integrate into StopCard (player)
4. Consider IndexedDB for photo storage

---

## Design Language

All hunt UI follows the existing Studio cream/gold/brown palette:

| Element | Style |
|---------|-------|
| Stop markers | Gold circle (#d4af37) with white number, 24px diameter |
| Route line | Dashed gold, 2px stroke, 50% opacity |
| Player dot | Blue (#2563eb) pulsing circle with accuracy ring |
| Proximity ring | Gold dashed circle (10m radius at map scale) |
| Stop card (player) | Cream gradient panel, gold border, slides up from bottom |
| Progress bar | Gold fill on cream track |
| QR scanner frame | Gold corner brackets on camera feed |
| Completed stops | Greyed out marker with checkmark overlay |

### Fonts
- Stop titles: Spectral (serif, 700)
- Descriptions: Noto Serif (serif, 400)
- UI labels/distance: Be Vietnam Pro (sans-serif, 600)

---

## Technical Notes

### GPS Accuracy
- `enableHighAccuracy: true` requests GPS hardware (not just WiFi/cell)
- 10m trigger radius works well outdoors; indoors may need 15-20m
- `positionAccuracy` from the API tells us confidence — show warning if accuracy > 20m
- Require 2+ consecutive in-range readings before triggering (anti-jitter)

### Battery / Performance
- `watchPosition` with `maximumAge: 2000` avoids hammering the GPS
- Pause tracking when app is backgrounded (`document.visibilitychange`)
- Stop tracking when hunt is complete

### Offline Considerations
- Hunt data is localStorage — works offline once loaded
- Map tiles need network (could pre-cache with service worker later)
- QR scanning works fully offline (camera + local validation)
- GPS works offline

### Security
- QR payloads include a random secret — can't complete stops by guessing IDs
- Camera captures are local-only — never uploaded
- No server component — all data stays on device

### Svelte Patterns
- Legacy syntax: `$:`, `export let`, `createEventDispatcher`, `$store`
- Stores: Svelte `writable` with custom methods (same as annotationState)
- Context: share hunt store via Svelte context if needed
- Components: events for child→parent, `bind:this` + exported functions for parent→child
