# Changelog

Vietnam Map Archive. The app deploys continuously to Cloudflare Pages, so a
version here is a marker rather than a build: the number goes up when something
structural changed — a rewrite, a new data layer, a re-cut of the routes — not
on a schedule.

**The numbering is not invented.** The first app labelled itself `v1`, `v2
stable` and `v2.1` in its commits; this repository's early commits label
themselves `v1` through `v3.3`, and there is a `VMA_v3.2` snapshot repo to
match. So the hand-drawn HTML app keeps **1.x–2.x**, the SvelteKit rewrite keeps
**3.x**, and everything after that continues from `v3.3` — the last number
anyone wrote down.

Versions 6.0 and 7.0 are written out in full, because that is the architecture
that exists today. Everything earlier is summarised; the detail is in `git log`,
and most of it has been replaced.

The plain-language version of this file is published at
[maparchive.vn/changelog](https://maparchive.vn/changelog); its source is
`src/routes/(editorial)/changelog/releases.ts`. Add a release to both.

Raw history: `git log --reverse --format='%ad %s' --date=short`.

| Version | Date | In one line |
|---|---|---|
| [7.0](#70--september-2026) | Sept 2026 | Sixteen pages instead of twenty-three, one design system with dark mode, a front page that costs nothing, and OCR that can measure itself |
| [6.0](#60--august-2026) | Aug 2026 | A job queue and a worker, layered source, status transitions inside Postgres |
| [5.2](#52--june-2026) | Jun 2026 | `/explore` and `/trip` |
| [5.1](#51--may-2026) | May 2026 | One layer stack, a mobile viewer, bulk upload and scout |
| [5.0](#50--april-2026) | Apr 2026 | Route groups, `MapShell`, a unified catalogue, the OCR pipeline |
| [4.1](#41--march-2026) | Mar 2026 | Admin pipeline, blog, the first vectorization |
| [4.0](#40--february-2026) | Feb 2026 | Supabase, accounts, stories — the map became a platform |
| [3.4](#34--january-2026) | Jan 2026 | View modes, core modules pulled apart |
| [3.3](#33--december-2025) | Dec 2025 | Undo/redo, shareable links, the trip page |
| [3.0](#30--october-2025) | Oct 2025 | Rewritten in SvelteKit |
| [2.1](#21--june-2025) | Jun 2025 | A time slider |
| [2.0](#20--april-2025) | Apr 2025 | First stable public site |
| [1.0](#10--april-2025) | Apr 2025 | One `index.html` and a folder of scanned maps |

---

## 7.0 — September 2026

**Current.** The month the surfaces were consolidated and the reading pipeline
got a way to measure itself. 157 commits.

### The route merge — twenty-three pages became sixteen

- The archive is one subtree (`/catalog`, `/catalog/[id]`, `/catalog/place/[name]`) instead of three sibling routes.
- `/admin` is one console with `?tab=bulk|scout|status`. Before this, `/admin` itself was a 404 — only its three children existed.
- `/explore` is the map surface, mode chosen by `?mode=browse|studio|story`.
- `/scan` is the scanned-image surface, mode chosen by `?mode=inspect|triage|trace|review`.
- Grouping by shell rather than by verb is what lets the map, the basemap and the warped sheet stay loaded across a mode change instead of being rebuilt.
- Every retired path 301s to its replacement, so old links and printed QR codes still work.
- `/directory` renders the one page index, from the same list the command palette offers.

### One design system

- A plate-tone palette taken off the sheets themselves, replacing a second cooler palette the map sidebars had been using.
- Dark mode, with four things pinned on purpose because they must not flip: yellow's ink, accent-fill text, the ink-slab footers, and the light-pinned heroes.
- The theme toggle is two states, light ⇄ dark, not three.
- One button system: emoji iconography and the blobs around it are gone; the offset shadow came off every button.
- The app is set in Google Sans with a pairing chosen to stay readable for older eyes; every label is set the way the sheet it came from set it.
- A two-tier top bar: three public links in the bar, every tool behind one `Tools ▾` menu.
- Type, colour, border and shadow all route through tokens; fifteen undefined CSS variables were repaired and the sheets deduped.

### The home page got cheap

- The header is two still images with a slider between them, and the live map moved to a section further down. Every visitor used to pay for the whole map engine to look at scenery they had not asked for.
- At rest the front page is now ~63 requests / ~0.9 MB; the live demo costs its 71 requests and 1.36 MB only if a reader scrolls to it.
- The demo's four beats — modern city, 1882 sheet warping over it, traced footprints, validated labels — play on every visit, with the sheet's footprints and labels frozen into the bundle instead of fetched.
- The header's slider sweeps by itself until the reader touches it, then stops for good. It never runs under `prefers-reduced-motion`.
- The page's data is server-rendered, so a crawler sees the catalogue and a true published count instead of a fallback number.
- Fixed: a phone could not scroll past the hero (OpenLayers' non-passive wheel listener), and the hero quoted a label count it was simultaneously capping below.

### /explore

- Split into two rails: the archive on the left, the sheet on top of the stack on the right. Both wear the same frame and share the CSS rather than copying it.
- The left rail is two tabs — All and Picked — answering to one search box, so a query narrows the layer stack as well as the archive.
- The right rail is Info / Legend / Control, with place search and My location at its crown.
- Each layer-stack row is two lines now: name and actions on top, opacity slider underneath. The name is the zoom-to button, so no press-vs-drag threshold.
- A lit legend row and the map's pulse are one thing — picking a place, or a legend entry, rings the spot instead of just moving the camera.
- "My location" finally draws where the reader is; it used to move the camera and leave no marker.
- Fixed: a share link keeps the camera it was sent with.

### /scan

- One left rail for every mode — which sheet, what is drawn over it, how far to dim the paper — so a mode change swaps the right-hand panel instead of rebuilding the page.
- Triage now proposes the whole thing and leaves a person only to agree: the layout pass adopts its own main-map region as the crop, tile priorities come from the density pre-pass, and saving is the acceptance.
- Regions survive a remount; the neatline and the regions follow the pointer.
- A sheet can be reviewed from the keyboard, one hand on the map.

### Reading the sheets (OCR)

- **A measured gate.** Runs can be scored without writing to production, with columns for diacritic retention, category, detection and the label's baseline rotation.
- **seq-v1 is the default prompt** — it passes the gate; v8 on the sequence path failed it (recall −14, char_acc −2.7) and was rejected on the numbers.
- **A sheet's printed street index is now read**, and a body pass is scored against it — free ground truth, no hand labelling.
- Two passes by default: a grid, a half-tile-shifted grid, then a vote. `passes: 3` adds a 1200 px pass for small type.
- A label is stored as its own rectangle, not just the box around it.
- Tiles are sized by ground distance rather than by pixels, so one setting means the same thing on sheets at different scales.
- A run reports what it cost.
- Fixed: the twelve faults the automated path was hiding; the row-sequence call never received the prompt the run asked for; letter-spaced street names left residue; a jittered small box was being counted as a second word; the dedupe was deleting distinct streets; a partial write looked like a finished run; a sheet with over 1000 extractions lost its tail and its counts.

### Infrastructure

- **The basemap is self-hosted** — one PMTiles archive covering Hanoi to the Mekong in R2, served off a custom domain with the build date in the key, so a rebuild cannot strand readers on stale bytes. It replaced a Saigon-only extract that left 21 of 40 sheets on bare fill.
- The fonts are self-hosted too; three render-blocking Google Fonts requests are gone, along with the Google Translate widget (~100 kB on every page for a control that never rendered).
- `info.json` is cached at the edge, and the two hosts every page needs are warmed early.
- Fixed: the mirrored tile pyramid was falling through to archive.org; thumbnails asked R2 for a size it did not have; `tile_map.sh` was dying silently on every map; the warped canvas was not cleared between frames.
- Security: the browser was being handed an unvalidated session; draft maps stopped being anonymously readable.
- Cross-feature seams are declared and lint-enforced, so one feature can only reach another through a stated public entry point.
- The dead search cluster (four components and 412 lines of CSS) and a duplicate location layer were deleted.

### Elsewhere

- Search inside the maps, a place-time index, and the period press.
- Two pages that make the system visible to its owner: `/admin?tab=status` and `/screens`.
- A published map's georeference can be reopened and corrected in one click.
- Scout gained the AGS Library, a usable image on every row, and a recorded reason instead of a score.
- Five sheets carrying NAC2 scholarship are featured.
- Copy: say what the archive is and has, rather than what it will have; the archive is of Vietnam and now says so consistently.

---

## 6.0 — August 2026

The cleanup and the queue. 74 commits, after seven quiet weeks (13 Jun → 2 Aug).

- **`src/lib` was restructured into layers** — `core → data → map → features → routes`, with `ui` as leaf primitives and `server` import-guarded — and the rule is enforced by lint rather than by review.
- ~3.1k lines of grep-verified dead code deleted; every oversized component split; server boilerplate consolidated into `$lib/server`.
- **A job queue and a worker replaced the copy-paste CLI.** Publishing enqueues work; a worker claims it. Worker keys mean pipeline machines hold no database credentials.
- **Status transitions moved into Postgres** as `security definer` RPCs, and `map_pipeline_status` became a view over the queue.
- One visibility model: `draft | public | featured`. A published map must be georeferenceable.
- Stories got a review queue; contributions got a rate limit.
- Server-rendered share page with link previews.
- OCR: level-aware label ↔ footprint join, an auto-priority tile grid from a density pre-pass, legend extraction, numbered legend points on the georeferenced map, and **the eval harness that gates core-pipeline changes on measured quality**.
- The SAM2 seed module that never existed, plus a colour pre-pass.
- Fixed: node builtins now carry the `node:` prefix, or the Cloudflare bundle publishes nothing; the build runs from a clean output dir and gates on bundle integrity; the basemap came off CARTO's keyless endpoint after it began stamping "API KEY REQUIRED" over every tile.
- Deployment: several rounds of it. The conclusion is that there is no root `wrangler.toml` — one displaces the dashboard's whole environment — and secrets resolve through `$env/static/private`, because the dynamic form does not bind on Pages.

---

## 5.2 — June 2026

`/explore` arrived with its welcome chooser, coverage lookup and guided tour, and
`/trip` with it. Catalogue search was consolidated into one shared engine.
Coverage lookup became role-aware so staff see draft maps; the admin map-edit UI
was restored in the catalogue; the "Looking up maps…" spinner stopped hanging.

## 5.1 — May 2026

The viewer was rebuilt around a single concept — one layer stack — and mobile
got a three-tab bottom bar backed by one shared drawer, after which desktop and
mobile shared components. Bulk R2 upload, one `MapEditModal` for admin edits,
holding institutions, the scout discovery pipeline, unified catalogue search with
full-text search, and a codebase cleanup pass. The basemap moved to Protomaps
with Esri satellite. `/annotate` became `/studio` and gained a keyframe
animation panel.

## 5.0 — April 2026

Six numbered phases of structural work: the trace tool, a rewritten label tool
replacing a monolith, a unified `/catalog` with admin features, `MapShell`
composability, a profile page, and route groups with the editorial UI. The OCR
pipeline and R2 mirroring landed, along with the digitalize tools, the pipeline
status API and the footprints API.

## 4.1 — March 2026

The admin pipeline, the about and blog routes, the export API, and the first
SAM-based vectorization pipeline (later superseded by MapSAM2). MGRS support for
4–10 digit references. Google login. The VWAI and CDEC experiments, cleaned out
again by the end of the month.

## 4.0 — February 2026

Supabase, accounts, migrations, PWA and mobile fixes, story publishing, the
annotation store, and the first Label Studio. This is where the map stopped
being a document and became a platform with users.

## 3.4 — January 2026

View mode controls, and the core modules pulled apart for the first time.

## 3.3 — December 2025

Annotation history with undo/redo, shareable map URLs, a responsive layout,
rotation, and the trip page. Commit `v3.3` on 16 Dec 2025 is the last version
number anyone wrote by hand; the [`VMA_v3.2`](https://github.com/lqtue/VMA_v3.2) snapshot repo was pushed the day
before it.

## 3.0 — October 2025

**Rewritten in SvelteKit**, in four days: the commits read `v1`, `v2`, `v3`,
`v3.1`, `v3.2` between 27 and 30 October 2025. Same project, second
implementation — this is the repository you are reading.

---

## Before this repository

The first two years live in separate repositories on GitHub, now read-only.
They were left where they are rather than folded in — most of their weight is
scanned images, and the history is one click away. They are where the numbering
comes from.

The 2025 site is still published at
[lqtue.github.io/VMA](https://lqtue.github.io/VMA/), with a notice pointing
here.

### 2.1 — June 2025

A time slider, so the maps could be moved through rather than picked from a
list (`v2.1 with time slider`, 17 Jun 2025). A README followed on the 21st,
setting out the vision, the phases and the volunteer roles. Last push to that
repository: 30 Jun 2025.

### 2.0 — April 2025

`v2 stable` (20 Apr 2025): a welcome screen, an instruction popup after it fades,
and a narrative track in `narrative.csv`.

### 1.0 — April 2025

[`lqtue/VMA`](https://github.com/lqtue/VMA), created 3 Apr 2025, first upload on the 12th: one `index.html`,
hand-written CSS and JS, a folder of scanned sheets as `.webp`, and web fonts.
Served from GitHub Pages at `lqtue.github.io/VMA`. 73 commits, most of them
`Add files via upload` — the maps were the content and the site was the wrapper.

[`lqtue/historical_maps`](https://github.com/lqtue/historical_maps) (25 Jun 2025) is a single `index.html` and one commit —
an experiment, not a version.
