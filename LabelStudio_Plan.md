# Label Studio: IIIF Building Number Pinning

## Context
Historical maps of Vietnam have numbered buildings. The Label Studio should let users view the actual map image (via IIIF), click on numbered buildings to pin them, type the number + description, and build consensus across multiple users. Verified pins can later be projected onto the georeferenced map using Allmaps transform.

Currently, LabelCanvas renders pins on a **blank dark background** (no actual map image), the sidebar uses a hardcoded legend of categories, and the consensus system is stubbed out.

---

## Phase 1: Load IIIF Map Tiles in LabelCanvas

**Goal**: Show the actual historical map image so users can see numbered buildings.

**Files to modify:**
- `src/lib/contribute/label/LabelStudio.svelte` — call `fetchIIIFImageInfo(task.mapId)` on task load, pass info down
- `src/lib/contribute/label/LabelCanvas.svelte` — add `TileLayer` with `ol/source/IIIF` + `ol/format/IIIFInfo`; remove unused `XYZ` import and `imageUrl` prop; add `iiifInfoJson` prop

**Approach:**
- Reuse existing `fetchIIIFImageInfo()` from `src/lib/iiif/iiifImageInfo.ts`
- Use `IIIFInfo.getTileSourceOptions()` → `new IIIF(options)` → `new TileLayer({ source })`
- Coordinate system already compatible (Y-axis flip convention matches pin storage)

---

## Phase 2: Building Number Input (Replace Fixed Legend)

**Goal**: Users click the map → popover asks for building number + description → pin is saved.

**New file:**
- `src/lib/contribute/label/PinInputPopover.svelte` — floating form near click point with: number input (required), description input (optional), confirm/cancel buttons

**Files to modify:**
- `src/lib/contribute/label/LabelStudio.svelte` — remove `legendItems`, `selectedLabel`, `handleSelectLabel`; add popover state (pending coords + screen position); on popover confirm → `createPin()` with number as `label`, description as `description`
- `src/lib/contribute/label/LabelCanvas.svelte` — always emit click with pixel coords + screen position (remove `placingEnabled` gating); update pin style to show building number text prominently
- `src/lib/contribute/label/LabelSidebar.svelte` — remove entire Legend section; replace with brief instructions
- `src/lib/contribute/label/types.ts` — add `description?: string` and `displayName?: string` to `LabelPin`
- `src/lib/supabase/labels.ts` — add `description` param to `createPin()`; update `toLabelPin` mapper

**DB migration** (`supabase/migrations/011_label_pins_description.sql`):
```sql
ALTER TABLE label_pins ADD COLUMN IF NOT EXISTS description TEXT;
```

---

## Phase 3: Building Table (Pinned Section)

**Goal**: Sidebar shows a scannable table of all labeled buildings for the current task.

**New file:**
- `src/lib/contribute/label/BuildingTable.svelte` — compact scrollable table sorted by building number

**Table columns**: # (number) | Type (description) | By (user) | Agree (count) | Actions (delete own)

**Files to modify:**
- `src/lib/supabase/labels.ts` — update `fetchTaskPins` to join `profiles` table for `display_name`
- `src/lib/contribute/label/LabelSidebar.svelte` — integrate `BuildingTable`, pass `allPins` + `consensusItems`
- `src/lib/contribute/label/LabelStudio.svelte` — pass all pins (not just myPins) to sidebar

**RLS note**: `profiles` table needs the policy from migration 010 (already created) or a similar one allowing reads of users who contributed pins.

---

## Phase 4: Consensus Algorithm

**Goal**: When multiple users pin the same location with the same number, it becomes verified.

**New file:**
- `src/lib/contribute/label/consensus.ts` — pure function `computeConsensus(pins, options)`

**Algorithm:**
1. Spatial clustering: group pins within 20px Euclidean distance
2. Within each cluster, group by label (building number)
3. Count distinct users per (cluster, label) pair
4. Status: `pending` (1 user) → `agreed` (≥3 users) → mark for verification

**Files to modify:**
- `src/lib/contribute/label/LabelStudio.svelte` — call `computeConsensus()` reactively when `pins` change; pass results to Progress + BuildingTable
- `src/lib/contribute/label/BuildingTable.svelte` — show green/amber/red status dots per row
- `src/lib/contribute/label/LabelProgress.svelte` — already wired to display consensus stats

---

## Phase 5: Geo Projection Prep (Architecture Only)

**Goal**: Prepare for projecting verified pixel pins onto georeferenced maps.

**New file:**
- `src/lib/contribute/label/projection.ts` — stub with `createTransformerForTask(mapId)` and `pixelToGeo(transformer, x, y)` using `@allmaps/transform`

**No UI changes** — this is a utility for future use. The key insight: `label_pins.pixel_x/pixel_y` + Allmaps annotation GCPs → `GcpTransformer.transformToGeo([x, y])` → `[lon, lat]`.

---

## Implementation Order

1. Phase 1 (IIIF tiles) — foundation, everything else depends on seeing the map
2. Phase 2 (pin input) — core interaction
3. Phase 3 (building table) — makes pinning useful
4. Phase 4 (consensus) — community value
5. Phase 5 (geo projection) — stub only

## Verification
- `npm run check` passes (only pre-existing 5 Timeout errors)
- Open `/contribute/label` → map tiles load from IIIF
- Click on map → popover appears → enter number → pin shows on map + in table
- Multiple users' pins visible in building table with agreement counts
