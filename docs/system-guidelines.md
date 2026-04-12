# VMA System Guidelines

Canonical reference for page structure, component patterns, and design decisions. All new routes and components must follow these rules. Deviations require a comment explaining why.

---

## 1. Two page registers

Every page belongs to exactly one register. The register determines which layout shell and CSS classes to use.

### Editorial register
Used by: Home (`/`), About, Blog, Contribute hub, Knowledge Graph, Timeline, Sources, any new public landing page.

Shell structure:
```
.page (class:mounted fade-in)
  NavBar.svelte
  <header class="editorial-hero">
    <div class="hero-inner">
      <div class="label-chip">Context label</div>
      <h1 class="hero-title">Headline<br><span class="text-highlight">key word.</span></h1>
      <p class="hero-sub">Supporting sentence.</p>
    </div>
  </header>
  <main class="editorial-main">
    <!-- section-cards go here -->
  </main>
  <footer class="editorial-footer">...</footer>
```

All editorial page CSS is in `src/styles/components/editorial.css`, imported globally. **Do not redefine these classes inline.** If a page needs a layout variation, add a modifier class or extend `editorial.css`.

### Tool / mode register
Used by: `/view`, `/create`, `/annotate`, `/contribute/label`, `/contribute/review`.

Shell structure: fullscreen, no NavBar, no footer.

**Two sub-types:**

#### Geo-map modes (`/view`, `/create`, `/annotate`)
Use `GeoMapShell` (`src/lib/shell/GeoMapShell.svelte`) as the outer layout. It provides:
- `workspace` + `map-stage` grid with `with-sidebar` / `compact` breakpoints
- Responsive detection (`isMobile`, `isCompact`) — bind these from the parent
- Sidebar collapse/toggle + "show panel" button
- Mobile sidebar sliding panel + backdrop

Slots: `sidebar` (desktop panel), default (map content inside `map-stage`), `floating` (bottom-right controls), `mobile-sidebar` (sliding panel on mobile).

MapShell or StudioMap goes in the default slot. Never create a second OL map outside of MapShell.

```svelte
<div class="my-mode" class:mobile={isMobile}>
  <GeoMapShell bind:sidebarCollapsed bind:isMobile bind:isCompact>
    <svelte:fragment slot="sidebar"><MySidebar /></svelte:fragment>
    <MapShell ...><HistoricalOverlay /><!-- mode content --></MapShell>
    <svelte:fragment slot="floating"><!-- basemap btn, etc. --></svelte:fragment>
    <svelte:fragment slot="mobile-sidebar"><MySidebar /></svelte:fragment>
  </GeoMapShell>
</div>
```

The mode root div (`.my-mode`) sets `height: 100dvh`, `display: flex`, `flex-direction: column`. Import mode-specific CSS (e.g. `view-mode.css`) in the mode — do NOT import `mode-shared.css` (GeoMapShell handles it).

#### Pixel-map modes (`/contribute/label`, `/contribute/review`)
Own OL instance in IIIF pixel coordinates. Do not use MapShell or GeoMapShell.

LabelStudio uses: `top-bar` + `workspace` (with resizable `panel` + `map-stage`) + `bottom-bar`.
ReviewMode uses: `review-header` + `review-body` (canvas + sidebar, dark theme).

These two modes are different enough that no shared shell is used. New pixel-map modes should follow the LabelStudio pattern (light theme, tool-heavy) or ReviewMode pattern (dark theme, review-heavy) as appropriate.

### Admin register
Used by: `/admin`, `/contribute/catalog`.

Shell structure: full-page, no NavBar, no footer. Sticky top-bar with left/right zones.

```
.dashboard
  <header class="top-bar">
    <div class="top-bar-left">...</div>       <!-- title + badge -->
    <div class="top-bar-right">...</div>      <!-- search, sort, action buttons -->
  </header>
  <main class="content">
    <!-- admin content: grids, task lists, edit forms -->
  </main>
```

CSS: import `$styles/layouts/admin.css` in the component's `<script>`:
```js
import "$styles/layouts/admin.css";
```

Available classes: `.dashboard`, `.top-bar`, `.top-bar-left`, `.top-bar-right`, `.page-title`, `.badge`, `.search-input`, `.sort-select`, `.btn`, `.btn-primary`, `.btn-outline`, `.filter-bar`, `.content`, `.alert`, `.alert-error`, `.loading-state`, `.empty-state`, task-row classes.

`/contribute/catalog` uses admin.css with a sticky top-bar override and `max-width: 940px` on `.content`. `/admin` uses full 1200px.

Role check: admin pages require `profiles.role = 'admin'`; cataloger pages require `mod` or `admin`.

### Catalog browser register
Used by: `/catalog`.

Shell structure: editorial NavBar + filter bar + card grid. Uses catalog-specific CSS that lives inline in `+page.svelte` (1246 lines, pending extraction to `src/styles/layouts/catalog.css` — see §11 Known Debt).

This is the only page type whose CSS is not yet extracted. Until task #25 is done, treat `/catalog` as a monolith — do not copy its inline styles elsewhere.

---

## Summary: 7 page registers

| Register | Routes | Shell |
|----------|--------|-------|
| Editorial | `/`, `/about`, `/blog`, `/contribute`, `/contribute/georef`, `/login`, `/signup` | NavBar + editorial-hero + editorial-main + footer |
| Catalog browser | `/catalog` | NavBar + filter-bar + card grid (inline CSS) |
| Geo-map tool | `/view`, `/create`, `/annotate` | GeoMapShell (fullscreen, no nav) |
| Pixel-map label | `/contribute/label` | LabelStudio (own OL, top-bar + workspace) |
| Pixel-map review | `/contribute/review` | ReviewMode (dark, review-header + review-body) |
| Admin | `/admin` | admin.css dashboard (top-bar + content, 1200px max) |
| Cataloger | `/contribute/catalog` | admin.css dashboard (top-bar + content, 940px max) |

---

## 2. Route map

| Route | Register | Component | Auth |
|-------|----------|-----------|------|
| `/` | editorial | `+page.svelte` (monolith, pending split) | none |
| `/about` | editorial | `+page.svelte` | none |
| `/blog` | editorial | `+page.svelte` | none |
| `/catalog` | editorial | `CatalogPage` | none |
| `/contribute` | editorial | `+page.svelte` | none |
| `/contribute/georef` | editorial | `+page.svelte` | none |
| `/contribute/catalog` | editorial | `+page.svelte` | mod/admin |
| `/contribute/label` | tool | `LabelStudio.svelte` | any auth |
| `/contribute/review` | tool | `ReviewMode.svelte` | mod/admin |
| `/view` | tool | `ViewMode.svelte` | none |
| `/create` | tool | `CreateMode.svelte` | auth |
| `/annotate` | tool | `AnnotateMode.svelte` | auth |
| `/admin` | tool | `AdminDashboard.svelte` | admin |
| `/login`, `/signup` | editorial | `+page.svelte` | none |

**Redirects** (301, query params preserved):
- `/studio` → `/annotate`
- `/trip` → `/view`
- `/hunt` → `/view`
- `/georef` → `/contribute/georef`

---

## 3. Lib directory layout

```
src/lib/
  shell/          MapShell, HistoricalOverlay, warpedOverlay, context
  stores/         mapStore, layerStore, urlStore
  maps/           domain module: types, service, iiifManifest, adminApi
  supabase/       client, server, context, annotations, stories, labels, favorites
  contribute/
    label/        LabelStudio, LabelCanvas, LabelSidebar, LabelProgress, types
    review/       ReviewMode, ReviewCanvas, ReviewSidebar
  view/           ViewMode, ViewSidebar, StoryPlayback, StoryMarkers, GpsTracker
  create/         CreateMode, StoryEditor, MapClickCapture, ChallengeConfig
  annotate/       AnnotateMode, AnnotationsPanel, StudioMap
  map/            annotationState, annotationHistory, annotationContext, olAnnotations
  viewer/         types, constants (shared across map modes)
  story/          types, storyStore
  geo/            geolocation, geo, types
  iiif/           iiifImageInfo
  ui/             NavBar, MapToolbar, SearchPanel, catalog/, ThemeToggle, ...
  admin/          AdminDashboard, MapEditModal, MapUploadModal, adminApi, NeatlineEditor
  blog/           posts.ts (static)
  utils/          debounce, id, persistence/
  styles/         (alias $styles)
```

**Rules:**
- New domain features go in a dedicated subfolder, not at the lib root.
- `supabase/` holds data-layer functions only — no UI. UI components import from `supabase/` but not vice versa.
- `maps/service.ts` is the canonical public-read layer. `supabase/maps.ts` is a backward-compat shim (pending removal). New code uses `maps/service.ts`.
- One Svelte component per file. No barrel `index.ts` re-exports for components.

---

## 4. Component rules

### Svelte syntax
This project uses **legacy Svelte syntax**. Do not use runes.

```svelte
<!-- correct -->
export let value: string;
$: derived = value.toUpperCase();
const dispatch = createEventDispatcher();

<!-- forbidden -->
let value = $state('');
let derived = $derived(value.toUpperCase());
```

### Props and events
- Parent → child: props + Svelte `createEventDispatcher` (dispatch up, never two-way bind on complex data).
- Deep context sharing: use `setContext`/`getContext` (see `getShellContext()`, `getSupabaseContext()`, `getAnnotationContext()`).
- Never prop-drill more than two levels. Use context instead.

### Reactive declarations
- `$:` for derived values. Keep them short — if a reactive block is more than 3 lines, extract a function.
- Do not use `$:` for side effects that depend on async operations; use `onMount` or reactive functions called explicitly.

### Lifecycle
- `onMount` for DOM setup, event listeners, and initial data fetches.
- Always return a cleanup function from `onMount` if event listeners are added.

---

## 5. API routes

All API routes live under `src/routes/api/`. All mutating routes require authentication; admin routes additionally check `profiles.role = 'admin'`.

### Structure
```
/api/admin/maps/            GET list, POST create
/api/admin/maps/[id]/       PATCH update, DELETE
/api/admin/maps/[id]/image/        POST upload to IA
/api/admin/maps/[id]/annotation/   PATCH update Allmaps GCPs
/api/admin/maps/[id]/iiif-sources/ GET list, POST add
/api/admin/maps/[id]/iiif-sources/[sourceId]/  PATCH, DELETE
/api/admin/maps/fetch-iiif-metadata/  POST { manifestUrl }
/api/admin/footprints/      GET list, PATCH status
/api/admin/pipeline/annotate/  POST build annotation (generic utility)
/api/export/footprints/     GET export
/api/contribute/catalog/[mapId]/  PATCH Dublin Core metadata (mod/admin only)
/auth/callback/             OAuth
```

### Rules
- Admin routes use the Supabase service key (bypasses RLS). Always re-check `profiles.role` in the handler — do not rely on RLS alone.
- Requests that read many rows for export should use the service key, not the anon key.
- Accept JSON, return JSON. No form data.
- Return `{ message: string }` on error alongside the HTTP status code.
- Never expose the service key to the client. It is server-only (`$env/static/private`).

---

## 6. Data layer conventions

### Map identity
`maps.id` (UUID) is the canonical map identifier everywhere — in FK columns, URL params, and component props.

`maps.allmaps_id` is used only when calling Allmaps APIs (building annotation URLs, warped tile layers). It is never a join key.

**Current debt:** `mapStore.activeMapId`, URL hash `&map=`, and the `supabase/maps.ts` shim still use `allmaps_id` as identity. This will be resolved when the home page migrates to `maps/service.ts`.

### Supabase client usage
- Browser: `import { getSupabaseContext }` → `const { supabase, session } = getSupabaseContext()`
- Server / API routes: `createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY)` directly
- Never call the service-key client from a component. It must stay in `+server.ts` files.

### TypeScript types
- `src/lib/supabase/types.ts` is generated — do not hand-edit. Regenerate with:
  ```bash
  npx supabase gen types typescript --project-id trioykjhhwrruwjsklfo \
    | tail -n +2 > src/lib/supabase/types.ts
  ```
  (The `tail -n +2` strips the `npm warn` line that prefixes the output.)
- When accessing columns added since the last type regeneration, cast via `(supabase as any).from(...)` and add a `// TODO: regenerate types` comment.
- Insert/Update payloads: use `?:` optional field syntax, not `Partial<{...}>`. `Partial` resolves as `never` in Supabase client types.

---

## 7. Styling rules

All shared styles live in `src/styles/`. Import with the `$styles` alias:
```svelte
<style>
  @import '$styles/components/editorial.css';
</style>
```

### File map
```
src/styles/
  global.css          root import (tokens + all components)
  tokens.css          all CSS custom properties
  components/
    editorial.css     top-nav, hero, section-card, action-btn, footer, etc.
    buttons.css       pill-btn, action-btn variants
    label.css         label-studio-specific classes
    catalog.css       catalog grid
    admin.css         admin dashboard
    admin-modals.css  modal scaffolding
  layouts/
    mode-shared.css   shared mode chrome (bottom-bar, panel, map-stage)
    view-mode.css
    create-mode.css
```

### Token usage
Never hardcode hex values in component CSS. Always use `var(--color-*)`, `var(--border-*)`, `var(--shadow-*)`, `var(--radius-*)`.

Wrong: `border: 3px solid #111;`
Right: `border: var(--border-thick);`

**Exception:** `/contribute/catalog` still uses hardcoded hex values in catalog-specific classes (map rows, progress bar, form inputs). These will be tokenised when the page is fully refactored.

### Component-scoped CSS
- CSS in a `<style>` block is component-scoped by default. Use it for anything layout-specific to that component.
- Shared classes (listed in `editorial.css`) are global and must not be redefined per-component.
- Use `:global()` sparingly — only for styling third-party elements (OL controls, etc.) that Svelte cannot scope.

### Inline styles
Allowed only for dynamic values that cannot be expressed as CSS classes: `style="--sidebar-width: {sidebarWidth}px"`. Not for static styles.

---

## 8. Navigation and footer

Every editorial page must include:
1. `<NavBar />` (component at `src/lib/ui/NavBar.svelte`)
2. `<footer class="editorial-footer">` with all current nav links

When adding a new public page:
1. Add the route link to `NavBar.svelte`
2. Add it to the footer in `NavBar.svelte` and in `src/routes/+page.svelte`
3. Add it to the Route Map table in this document (§ 2)

---

## 9. Page state pattern

All editorial pages use a mount fade-in:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  let mounted = false;
  onMount(() => { mounted = true; });
</script>
<div class="page" class:mounted>...</div>

<style>
  .page { opacity: 0; transition: opacity 0.4s ease; }
  .page.mounted { opacity: 1; }
</style>
```

For pages that load async data, `loading` state shows a skeleton or spinner inside the content area — not on the full page. The hero and nav should be visible immediately.

---

## 10. Roles and access

| Role | Access |
|------|--------|
| (none / logged out) | Public read: viewer, catalog, blog, about |
| `user` (any logged-in) | Contribute: label, georeference, submit footprints |
| `mod` | All of the above + review/approve footprints, catalog metadata |
| `admin` | All of the above + admin dashboard, publish maps, manage users |

Role is stored in `profiles.role`. Check it server-side in API routes (never trust the client-side role for write operations).

The contribute hub (`/contribute`) shows review and catalog cards only to `mod` and `admin`.

---

## 11. Known debt

| Item | Location | Fix |
|------|----------|-----|
| `maps.allmaps_id` used as map identity | `mapStore`, URL hash `&map=`, `supabase/maps.ts` shim, `+page.svelte` map grid link | Migrate to `maps.id` UUID with `maps/service.ts` (#29) |
| Home page uses bespoke layout classes | `src/routes/+page.svelte` | Refactor to `editorial-hero`, `editorial-main`, `section-card` (#26) |
| Home page CSS is 970+ lines inline | `src/routes/+page.svelte` | Extract to `src/styles/layouts/home.css` (#26) |
| Catalog CSS is 700+ lines inline | `src/routes/catalog/+page.svelte` | Scope all classes under `.catalog-page` → extract to `catalog.css` (#25) |
