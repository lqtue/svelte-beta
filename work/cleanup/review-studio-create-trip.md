# Cleanup review — studio / create / trip / story / image

Scope: `src/lib/studio/`, `src/lib/create/`, `src/lib/trip/`, `src/lib/story/`, `src/routes/(app)/{studio,create,trip,image}/`, `src/lib/supabase/{stories,annotations}.ts`, `src/styles/layouts/{create-mode,mode-shared}.css`.
Verified by grep across `src/` at HEAD (`4021382`).

## 1. DEAD CODE

### Legacy `hunt*` aliases — zero consumers anywhere in `src/`
- `src/lib/story/stores/storyStore.ts:161-168` — `createHunt/updateHunt/deleteHunt/getHunt/addStop/updateStop/removeStop/reorderStops` aliases; grep finds no caller → delete all 8.
- `src/lib/story/stores/storyStore.ts:256-258` — `startHunt/completeStop/stopHunt` aliases; no caller → delete.
- `src/lib/story/stores/storyStore.ts:12-23,31,38,44` — `StoryLibrary.hunts` field + `withHunts()` mirror; nothing reads `.hunts` → drop field, `set/update` collapse to plain store methods.
- `src/lib/story/types.ts:66-69` — `TreasureHunt`/`HuntStop`/`HuntProgress`/`HuntPlayerState` type aliases; no importer → delete.
- `src/lib/story/types.ts:52` + `storyStore.ts:197`, `supabase/stories.ts:48`, `CreateMode.svelte:368` — `StoryProgress.huntId` written in 4 places, read in 0 → delete field + its 4 writers.
- `src/lib/story/types.ts:48,50` — `currentStopIndex`/`completedStops` written in 8 places (`storyStore.ts:199,201,221,223`, `stories.ts:50,52`, `CreateMode.svelte:370,372,398,413,415`, `trip/[id]/+page.svelte:139,165`), read in 0 → delete both fields and all writers.
- `src/lib/story/types.ts:34` — `Story.stops` mirror written in 11 places (`storyStore.ts:59,106,117,128,141`, `stories.ts:39`, `CreateMode.svelte:132,280,299,307,330,542`, `trip/+page.svelte:295`), read in 0 → delete.

### Unused story-scene fields
- `src/lib/story/types.ts:17` — `StoryPoint.quest`; only ever mapped through (`stories.ts:13,168`, `trip/+page.svelte:273`), never rendered → drop from type + mappers (DB column can stay).
- `src/lib/story/types.ts:22` — `StoryPoint.qrPayload`; mapped in `stories.ts:18,174` + `trip/+page.svelte:278`, never read; no QR UI exists → drop.
- `src/lib/story/types.ts:24` — `StoryPoint.camera`; mapped in `stories.ts:20,177` + `trip/+page.svelte:280`, never applied — all three playbacks hardcode `zoom: 17` → drop or actually honour it in `applyPointOverlay`.
- `src/lib/story/types.ts:63` — `StopInteraction` values `'qr' | 'camera'` unreachable; every writer hardcodes `'proximity'` (`storyStore.ts:102`, `CreateMode.svelte:237,255`) → narrow to `'proximity'` or delete `interaction` entirely.
- `src/lib/story/types.ts:20` — `StoryPoint.interaction` required but never branched on → delete with the above.

### Unused exports
- `src/lib/supabase/stories.ts:75,95,115` — `createStory`, `updateStory`, `deleteStory` exported, zero importers (only `fetchPublicStories` and `syncStoryToSupabase` are used) → delete.
- `src/lib/supabase/stories.ts:45-56` — `rowToProgress()` defined, never called → delete (with the `StoryProgress` import on line 2).
- `src/lib/story/stores/storyStore.ts:159,254` — `loadFromSupabase: async () => {}` no-op stubs; callers `CreateMode.svelte:549` and `trip` await them for nothing → delete stub, replace `CreateMode:549` with `storiesLoading = false`.
- `src/lib/story/stores/storyStore.ts:25-27` — `createStoryLibraryStore(_supabase, userId)` takes a `supabase` arg it never uses (prefixed `_`) → drop the param.
- `src/lib/story/stores/storyStore.ts:179-182` — `createStoryPlayerStore(_supabase, _userId)` both params unused → drop; simplifies `trip/+page.svelte:40` and `explore/+page.svelte:25`.

### Unused props / events / locals
- `src/lib/create/PointInspector.svelte:21` — `export let index` never referenced in script or markup → delete + drop `index={selectedPointIndex}` at `CreateRightPane.svelte:97`.
- `src/lib/create/PointInspector.svelte:25,26` — `topLayerName`, `topLayerMapId` declared, comment admits they are back-compat only, never used → delete + drop pass-through at `CreateRightPane.svelte:98,100` and `CreateMode.svelte:747,751`.
- `src/lib/create/CreateSidebar.svelte:27,28` — `gpsActive`, `role` props never passed by either consumer (`CreateMode.svelte:726`, `StudioMode.svelte:619`) → keep defaults or delete.
- `src/lib/create/CreateSidebar.svelte:21` — `toggleGps` event dispatched at :59 but neither parent listens → delete the wiring.
- `src/lib/studio/StudioRightPane.svelte:30` — `zoomToMap` in the dispatcher type but never dispatched; `StudioMode.svelte:650` wires `on:zoomToMap={handleZoomToMap}` → dead wire; `handleZoomToMap` survives only via `handleZoomToOverlay`.
- `src/lib/studio/StudioRightPane.svelte:51,200` — `geoJsonInputEl` bound, never read → delete `bind:this`.
- `src/lib/create/CreateMode.svelte:17` — `import { fromLonLat } from "ol/proj"` unused → delete.
- `src/lib/create/CreateMode.svelte:57,291,718` — `shellMap` bound and assigned by `handleMapReady`, never read → delete `shellMap`, `handleMapReady`, and `on:mapReady` at :813; then `MapClickCapture`'s `mapReady` event (`MapClickCapture.svelte:16,38`) has no listener → delete it too.
- `src/lib/create/CreateMode.svelte:61,722` — `isCompact` bound, never read → delete.
- `src/lib/studio/StudioMode.svelte:76,615` — `isCompact` bound, never read → delete.
- `src/lib/studio/StudioMode.svelte:75,614` — `isMobile` bound, never read (unlike CreateMode which branches on it) → delete.
- `src/lib/trip/TripPlayback.svelte:86-89` — `onGripPointerMove` has an empty body + only a comment; wired at :162 → delete function and handler.
- `src/lib/trip/TripPlayback.svelte:527-531` — `.action-done` CSS class matches no element → delete.
- `src/styles/layouts/create-mode.css:223-294` — `.dialog-backdrop`, `.dialog-card`, `.dialog-card h3`, `.dialog-actions`, `.btn-primary`, `.btn-secondary`: zero matches in any `.svelte`; `NameDialog` uses `mo-*` classes → delete the whole "Dialogs" block (72 lines).
- `src/styles/layouts/mode-shared.css:213-219` — `.mobile-overlay` matches no component → delete.

### Orphaned route
- `src/routes/(app)/trip/[id]/+page.svelte` — no link, `goto`, or href anywhere in `src/` targets `/trip/<id>`; nothing generates the QR the header comment assumes → either wire a "Get trip link" action into `/create` or delete the route + `src/lib/trip/` (≈1010 lines).

## 2. DUPLICATION

### Story playback — two full implementations of the same state machine
- `src/lib/story/StoryPlayback.svelte:20-25` vs `src/lib/trip/TripPlayback.svelte:34-41` — identical derivations (`currentIndex`, `completedIds`, `currentPoint`, `isFinished`, `total`, `progressFraction`) → extract `deriveStoryPlaybackState(story, progress)` into `src/lib/story/playbackState.ts`.
- `src/lib/story/StoryPlayback.svelte:47-57` vs `src/lib/trip/TripPlayback.svelte:124-134` — byte-identical `submitAnswer()` challenge check → extract `checkAnswer(challenge, draft)`.
- `src/lib/story/StoryPlayback.svelte:38-45` vs `src/lib/trip/TripPlayback.svelte:103-115` — identical per-point answer-state reset via `lastPointId` → same extraction.
- `src/lib/story/StoryPlayback.svelte:93-116` vs `src/lib/trip/TripPlayback.svelte:224-253` — same question/reach challenge markup, different class prefixes (`pb-*` vs bare) → one `<ChallengeCard>` component.
- NOTE: `src/lib/explore/ExploreTour.svelte` is a driver.js coachmark tour, **not** story playback — the brief's premise is wrong; it shares nothing with the two above.

### Scene/point → map view application — three copies
- `src/lib/create/CreateMode.svelte:385-393` `applyPointOverlay`
- `src/routes/(app)/trip/[id]/+page.svelte:184-200` `applyPointOverlay` (same body, `?? null` instead of falsy check)
- `src/routes/(app)/explore/+page.svelte:324-333` `handleNavigatePoint` (inlined, calls `addMapOverlay(found, {clear:true})`)
→ extract `applyPointOverlay(point, mapList)` into `src/lib/story/applyPoint.ts`; all three then also share the `setView({..., zoom: 17})` line (`CreateMode:379,400`, `trip:244-248`, `explore:327`).

### Overlay-by-id resolution `m.id === id || m.allmaps_id === id` — five copies
- `src/lib/create/CreateMode.svelte:101`, `:386`
- `src/routes/(app)/trip/[id]/+page.svelte:187`
- `src/routes/(app)/explore/+page.svelte:330`, `:343`
→ one helper `resolveMapRef(mapList, id): MapListItem | null` in `src/lib/maps/service.ts`.

### Row → Story mapper duplicated in a route file
- `src/routes/(app)/trip/[id]/+page.svelte:264-298` reimplements `rowToPoint`+`rowToStory` from `src/lib/supabase/stories.ts:6-43` with 12 `(data as any)` casts → add `fetchStoryById(supabase, id)` to `stories.ts` and call it.

### Catalog pick / zoom handlers — three near-identical copies
- `src/lib/create/CreateMode.svelte:498-537` (`handlePickMap`, `handleZoomToMap`, `handleZoomToOverlay`, `handlePickLocation`)
- `src/lib/studio/StudioMode.svelte:113-170` (same four, `handleZoomToMap` adds an OL `animate`)
- `src/routes/(app)/explore/+page.svelte:305-321` (additive variant)
→ extract to `src/lib/shell/mapPickHandlers.ts` taking `(mapStore, mapList)`; `handleZoomToOverlay` (`CreateMode:534-537` / `StudioMode:132-135`) is byte-identical.

### Auth gate — verbatim duplicate incl. inline Google SVG
- `src/lib/create/CreateMode.svelte:581-607` vs `src/lib/studio/StudioMode.svelte:489-518` — same markup, same 4-path SVG, only heading/body text differ → `<AuthGate title body />` in `src/lib/ui/`.

### Library view — verbatim duplicate
- `src/lib/create/CreateMode.svelte:609-704` vs `src/lib/studio/StudioMode.svelte:521-598` — PageHero + loading + empty state + CatalogGrid/CatalogCard + rename/delete icon buttons (identical inline SVGs) + NameDialog → `<ProjectLibrary items= on:select on:rename on:delete>`.
- `src/lib/create/CreateMode.svelte:466-478` vs `src/lib/studio/StudioMode.svelte:419-437` — same `handleNameDialogSubmit` incl. the identical `setTimeout(…, 50)` hack to await the persisted store → same extraction.

### Inline title rename (dblclick → input → Enter/Escape)
- `src/lib/create/StoryHeaderPanel.svelte:19-41` vs `src/lib/studio/StudioRightPane.svelte:55-92` — identical logic, near-identical CSS (`.sh-title`, `.sh-title-input`) → `<InlineTitle bind:value on:rename>`.

### Timeline animation logic Studio vs Trip
- Not duplicated. `src/lib/studio/animation/playback.ts` (animejs + OL tween over keyframes) and the trip's point-by-point `setView` are genuinely different mechanisms. No action.

### Markers layers
- `src/lib/story/StoryMarkers.svelte:56-80` vs `src/lib/trip/TripMarkers.svelte:61-96` — same `VectorImageLayer` + `fromLonLat` + numbered `CircleStyle` sync loop; Trip adds reveal-gating + a trail line → merge into one `<StoryMarkers points currentIndex completedIds revealOnly showTrail>`.

## 3. OVERSIZED FILES — split boundaries

### `src/lib/create/CreateMode.svelte` (857)
- `:139-244` sample-data + `seedSaigonExample` + `pickSaigonHistoricalMap` → `src/lib/create/saigonSeed.ts` (~105 lines).
- `:294-343,540-543` point CRUD (`handleUpdatePoint`/`handleRemovePoint`/`handleReorder`/`handleUndo`/`createNewPoint`) → `src/lib/create/storyEdit.ts` as pure `(story, args) => Story` (~70).
- `:362-419` preview mode (`handlePreview`/`handlePreviewNavigate`/`handlePreviewComplete`/`handlePreviewClose`) → `src/lib/create/previewController.ts` (~55).
- `:581-704` auth gate + library view → shared `<AuthGate>` + `<ProjectLibrary>` (~125).
- `:498-537` catalog handlers → shared `mapPickHandlers.ts` (~40).
Residual editor shell ≈ 300 lines.

### `src/lib/studio/StudioMode.svelte` (770)
- `:222-311` Overpass flow (`currentViewportBbox`, bbox picker, `runOverpassImport`, `addOverpassResult`, `discardOverpassResult`) → `src/lib/studio/overpassController.ts` (~90).
- `:172-220` annotation event handlers — 11 one-line `drawToolRef?.x()` forwarders → collapse into one `on:annotationAction={e => drawToolRef?.[e.detail.op](...)}` or move to `src/lib/studio/annotationActions.ts` (~50).
- `:336-386` timeline handlers → `src/lib/studio/timelineController.ts` (~50).
- `:489-598` auth gate + library → shared components (~110).
- `:680-693` bbox-picker bar markup + `:746-769` its CSS → `src/lib/studio/BboxPickerBar.svelte` (~35).
Residual ≈ 300 lines.

### `src/lib/trip/TripPlayback.svelte` (575)
- `:52-100` snap-sheet drag mechanics → `src/lib/trip/useSnapSheet.ts` (~50) or a generic `<SnapSheet>` (its CSS `:319-346,422-430` goes with it).
- `:293-313` itinerary list + `:533-574` CSS → `src/lib/trip/TripItinerary.svelte` (~60).
- `:102-134` challenge state → shared `checkAnswer` (see §2).
- `:224-275` challenge + status banners → shared `<ChallengeCard>` (~50).
Residual ≈ 250 lines (mostly the 260-line `<style>`, which should move to `src/styles/layouts/trip.css`).

### `src/lib/studio/StudioRightPane.svelte` (520)
- `:190-261` annotate-mode body (draw controls + notice + list) → `src/lib/studio/StudioAnnotatePanel.svelte` (~75).
- `:263-322` inspector → `src/lib/studio/StudioInspector.svelte` (~60).
- `:110-125` `typeBadge`/`typeClass` → `src/lib/studio/annotationBadges.ts` (~16).
- `:55-92` title rename → shared `<InlineTitle>` (~38).
- `:337-520` — 183 lines of CSS re-declaring `sb-*` looks (`.field input`, `.row`, `.empty`) → move to `src/styles/components/sidebar.css`.
Residual ≈ 150 lines (a pure mode-switch shell).

### `src/routes/(app)/trip/[id]/+page.svelte` (497)
- `:252-332` `loadStory` → `fetchStoryById()` in `src/lib/supabase/stories.ts` (~80 removed).
- `:79-124` GPS handling + `requestGeolocation` → `src/lib/trip/tripGps.ts` (~45).
- `:126-171` `handleMarkVisited`/`handleAdvance` — progress mutation that belongs on the store → move onto `createStoryPlayerStore` as `markVisited(storyId,pointId)` / `advance(storyId,dir,total)` (~45).
- `:184-200` `applyPointOverlay` → shared helper (~17).
- `:67-77` route length + `estimatedMinutes` → `src/lib/trip/tripStats.ts` (~10). Note `:76` `Math.round(x)/5*5|0` is a precedence bug — it rounds to 1, not 5.
Residual ≈ 250 lines.

## 4. INCONSISTENCY

- `src/lib/story/stores/storyStore.ts:51` uses `randomId('story')` → `story-<uuid>`, but `stories.id` is a `uuid` column; `CreateMode.svelte:466-477` creates via `storyLibrary.createStory` then `syncStoryToSupabase` (`:353`) upserts that id → **publish fails for every story created through the New Story dialog**. `CreateMode.svelte:130` uses bare `crypto.randomUUID()` for the other path. → standardise on `crypto.randomUUID()` in `storyStore.createStory`.
- Same file — `src/lib/studio/stores/annotationProjectStore.ts:39` uses `randomId('proj')` then swaps the id for the Supabase one at `:66`; `storyStore` has no equivalent reconcile → two different local-id strategies for the same problem.
- `src/lib/create/CreateMode.svelte:115` persists the draft through a reactive `$:` into a localStorage store; `src/lib/studio/StudioMode.svelte:313-324` requires an explicit Save button. Same "project editor" concept, opposite save models → pick one.
- State plumbing: `layersStore` is imported directly by `CreateMode.svelte:30`, `PointInspector.svelte:12`, `trip/+page.svelte:28`, `playback.ts:19`; but `mapStore`/`layerStore` are created per-page (`createGeoMapStores`) and drilled as props. `annotationState`/`annotationHistory` use Svelte context (`StudioMode.svelte:57`). Three mechanisms in one feature → document the rule or unify on context.
- Props drilling: `CreateMode.svelte:741-753` passes 12 props to `CreateRightPane`, which forwards 5 of them unchanged to `PointInspector` (3 of those unused) → pass the `story` object + a context.
- Error handling: `supabase/stories.ts:71,91,111,124,153` and `supabase/annotations.ts:39,70,92,107` swallow errors into `console.error` + `false`/`[]`; `trip/+page.svelte:326-331` sets a user-visible `error`; `CreateMode.svelte:355` silently drops a failed publish (`if (!ok) { isPublishing = false; return; }` — no message) → return a `Result` and surface it.
- `as any` casts: `trip/[id]/+page.svelte:264,284-297` (12×), `supabase/stories.ts:6,24,27,45` (`row: any`), `image/+page.svelte:69`, `CreateMode.svelte:499` / `StudioMode.svelte:139` (`CustomEvent<any>`), `CreateSidebar.svelte:18` (`pickMap: any`) → all avoidable now that `src/lib/supabase/types.ts` is generated (CLAUDE.md explicitly prefers real types).
- Naming for one concept: `Story`/`StoryPoint` (type) vs "trip"/"stop" (`/trip`, `TripIntro:21` "Walking trip", `TripPlayback:184` `Stop {n}`) vs "hunt" (dead aliases) vs "tour" (`ExploreTour`, unrelated) → settle on story/point in code, keep "trip"/"stop" as UI copy only.
- Mobile support: `CreateMode.svelte:432` redirects mobile to playback; `StudioMode.svelte:8-9` says desktop-only but never branches on `isMobile` → studio silently renders a broken editor on mobile.

## 5. MODULE BOUNDARY VIOLATIONS

- `src/routes/(app)/trip/[id]/+page.svelte:257-261` — route file issues a raw `supabase.from('stories').select(...)`; every other story read goes through `src/lib/supabase/stories.ts` → move to `fetchStoryById`.
- `src/routes/(app)/trip/[id]/+page.svelte:128-171` — progress state machine (mark visited, advance, completedAt) lives in the route, while the store that owns `StoryProgress` sits at `storyStore.ts:189-243` → move onto the store.
- `src/routes/(app)/image/+page.svelte:68` — route queries `profiles` directly for role; `explore/+page.svelte:342` does the identical query → extract `fetchUserRole(supabase, userId)` into `src/lib/supabase/`.
- `src/lib/studio/StudioMode.svelte:36` — `import CreateSidebar from "$lib/create/CreateSidebar.svelte"` — studio → create cross-feature import of a component that is not create-specific (it is Layers/Controls/Browse) → move to `src/lib/ui/catalog/MapViewerSidebar.svelte`.
- `src/lib/studio/StudioMode.svelte:14` — studio imports `$styles/layouts/create-mode.css` for its auth gate/library classes → same fix as above; rename to `layouts/tool-library.css`.
- `src/lib/create/PointInspector.svelte:12,33-41` — a leaf inspector reads global `layersStore` directly to build its pin options, while its siblings receive everything as props → pass `pinOptions` down, or let `CreateMode` own it (it already computes `pinnedLayerName` at `:98-104`).
- `src/routes/(app)/image/+page.svelte:117,119` — links to `/view?map=` and `/annotate?map=`, both 301-redirect legacy paths; `/studio` ignores `?map` entirely so "Annotate" lands on an empty library → point at `/explore?map=` and drop or implement the studio deeplink.
- `src/lib/create/CreateMode.svelte:432` — `goto('/view?story=...')` → should be `/explore?story=` (`explore/+page.svelte:95` reads that param).
- `src/routes/(app)/trip/[id]/+page.svelte:175,359` — `goto('/view')` → `/explore`.

## 6. CONSOLIDATION PROPOSAL — one `stories` domain

Today: 4 dirs, 21 files, ~2,800 lines split by *route* (`story` = shared bits, `create` = editor, `trip` = mobile player, plus a second player inside `explore`). Every seam listed in §2 crosses those dirs.

Proposed `src/lib/stories/`:

```
src/lib/stories/
  types.ts               ← story/types.ts, minus the 9 dead fields (§1)
  store.ts               ← story/stores/storyStore.ts, minus 11 aliases + 2 stubs
  api.ts                 ← supabase/stories.ts + new fetchStoryById()  (moves trip:252-332 out of the route)
  applyPoint.ts          ← the 3 copies of applyPointOverlay (§2)
  playbackState.ts       ← shared derivations + checkAnswer (§2)
  editor/                ← create/*  (CreateMode → StoryEditor.svelte, + saigonSeed.ts, storyEdit.ts)
  player/
    StoryMarkers.svelte  ← merged story/StoryMarkers + trip/TripMarkers (reveal + trail as props)
    ChallengeCard.svelte ← extracted from both players
    DesktopPlayer.svelte ← story/StoryPlayback.svelte  (explore + create preview)
    TripPlayer.svelte    ← trip/TripPlayback + TripIntro + TripComplete + SnapSheet
```

`src/lib/studio/` does **not** join: it is annotation projects + keyframe animation on `annotation_sets`, sharing only `CreateSidebar` (which should move to `ui/catalog/` anyway, §5). Keep it separate.

Expected: 21 files → 15, ~2,800 → ~2,000 lines, and the 5 duplicate clusters in §2 collapse to 1 copy each. Do it in three commits: (a) delete §1 dead code, (b) extract the shared helpers in place, (c) move directories.

## 7. CSS

- `src/styles/layouts/create-mode.css:222-294` — `.dialog-backdrop` / `.dialog-card` / `.dialog-card h3` / `.dialog-actions` / `.btn-primary` / `.btn-secondary`: 0 matches in `src/**/*.svelte`; `NameDialog.svelte:48-89` uses `mo-*` → delete 72 lines.
- `src/styles/layouts/mode-shared.css:213-219` — `.mobile-overlay`: 0 matches → delete.
- `src/lib/studio/StudioMode.svelte:714-723` — `.studio-mode` is byte-identical to `.create-mode` in `create-mode.css:1-10`, which the same file already imports at `:14` → delete the local block, use `class="create-mode"` (or rename the shared class).
- `src/lib/studio/StudioMode.svelte:725-744` — `.btn-icon-edit` + `:hover` duplicate `create-mode.css:180-199` verbatim (already imported) → delete.
- `src/lib/story/StoryPlayback.svelte:146` — `box-shadow: 4px 4px 0 #111` hardcoded; token `--shadow-solid` exists → use the token.
- `src/lib/story/StoryPlayback.svelte:175,194` — `border: 1px solid #111` / `1.5px solid #111` hardcoded → `var(--border-thin)`.
- `src/lib/story/StoryPlayback.svelte:198,230,237` — `var(--sb-success)` / `var(--sb-danger)` used but the theme fallbacks live only in `sidebar.css`; fine, but `#111` on :146/:175/:194 breaks the archival theme.
- `src/lib/trip/TripPlayback.svelte:318-575` — 258 lines of component CSS hardcoding `#111`, `#fde68a`, `#bbf7d0`, `#dbeafe`, `#16a34a`, `#2563eb`, `#b91c1c` with `var(--sb-*, fallback)` only for accent/bg → per-component palette, violates the two-theme token rule; move to `src/styles/layouts/trip.css` and tokenise.
- `src/lib/trip/TripIntro.svelte:59-157` and `src/lib/trip/TripComplete.svelte:78-160` — same problem (`#111`, `#fde68a`, `#fef3c7`, `#555`, `#444` literal) → tokenise with the above.
- `src/lib/studio/StudioRightPane.svelte:443,444,477-479,412` — `#dcfce7`/`#fee2e2`/`#d4af37`/`#5b8a72`/`#7b6b9e`/`#166534` literals → add `--sb-badge-*` tokens.
- `src/lib/studio/StudioAnimationPanel.svelte:220,221,241` — `rgba(0,0,0,0.04)`, `background: #fff` literals in a themed panel → `var(--sb-card-bg)`.
- `src/lib/create/CreateMode.svelte:839-850` — `.mobile-banner` hardcodes `#fff7d1`, `1.5px solid #111`, `'Outfit', sans-serif` (a font not in the token set) → tokenise; `create-mode.css` is the right home.
- `src/lib/create/StoryPointsPanel.svelte:105` — `box-shadow: 0 0 0 2px #2563eb33` literal → `var(--sb-accent)`.
- `src/routes/(app)/image/+page.svelte:153-203` — `'Outfit'`/`'Space Grotesk'` font stacks + `#fff7d1`/`#f5f3ea`/`#c8c4b5` literals, none tokenised → move to `tool-page.css` and tokenise.
- `src/lib/story/StoryPlayback.svelte:1-4` header comment says "Used by /view (real playback) and /create" — `/view` no longer exists; actual consumers are `/explore` and `/create` → fix comment.

## Top 10 highest-value cleanups

| # | Cleanup | Effort | Risk |
|---|---|---|---|
| 1 | Fix `storyStore.ts:51` `randomId('story')` → `crypto.randomUUID()`; non-UUID ids make every dialog-created story fail to publish (`CreateMode:353`) | S | low |
| 2 | Delete all `hunt*` aliases + `stops`/`huntId`/`currentStopIndex`/`completedStops` mirrors — 11 exports, 4 types, ~30 write sites, 0 readers | S | low |
| 3 | Add `fetchStoryById` to `supabase/stories.ts`; delete the duplicate mapper + 12 `as any` in `trip/[id]/+page.svelte:252-332` | S | low |
| 4 | Extract `applyPointOverlay` + `resolveMapRef` — kills 5 copies of the id-resolution and 3 of the overlay-swap (`CreateMode:385`, `trip:184`, `explore:324`) | S | low |
| 5 | Extract `<AuthGate>` + `<ProjectLibrary>` from the verbatim `CreateMode:581-704` / `StudioMode:489-598` pair (~200 dup lines) | M | low |
| 6 | Delete dead CSS: `create-mode.css:222-294`, `mode-shared.css:213-219`, `StudioMode:714-744` (duplicates an imported block), `TripPlayback:527-531` — ~110 lines | S | low |
| 7 | Move `CreateSidebar` → `ui/catalog/MapViewerSidebar.svelte`; removes the studio→create cross-feature import (`StudioMode:36`) and the `create-mode.css` import (`:14`) | S | low |
| 8 | Split `CreateMode.svelte` (857) per §3 — `saigonSeed.ts`, `storyEdit.ts`, `previewController.ts` | M | med |
| 9 | Unify the two playback components behind shared `playbackState.ts` + `<ChallengeCard>` (`StoryPlayback` / `TripPlayback`) | M | med |
| 10 | Consolidate `story`+`create`+`trip` into `src/lib/stories/` per §6 (do last, after 1-9) | L | med |

Also worth a decision, outside the ranking: `/trip/[id]` has no inbound link anywhere in `src/` — either wire it up from `/create` or delete `src/lib/trip/` + the route (≈1,010 lines, effort S, risk low if genuinely unused).
