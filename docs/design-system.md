# VMA Design System

The visual language for Vietnam Map Archive. Applies to every public page and to the chrome of the map tools.

---

## Philosophy

**Neo-brutalist editorial.** Bold borders, offset shadows, flat fills — applied with editorial restraint. Not a playful toy, not a generic SaaS dashboard. A serious archive made legible and memorable.

Two registers coexist:

- **Editorial** (`/`, `/about`, `/blog`, `/contribute`, `/login`, `/profile`, `/admin/*`) — clean, left-aligned, information-dense.
- **Tool** (`/explore`, `/studio`, `/create`, `/trip/[id]`, `/image`, `/contribute/*`) — full-bleed map under the nav, sidebar chrome, compact controls.

New public pages default to the **editorial** register.

**There is one theme.** `tokens.css` has no `[data-theme]` block; no component reads `data-theme`; there is no `ThemeToggle` component. The `vma-theme` boot script in `src/app.html` is vestigial — nothing writes the key. Do not write CSS that assumes a second theme.

---

## Tokens

Defined in `src/styles/tokens.css`, imported first by `src/styles/global.css`. **Never hardcode a colour, border, shadow or radius in a component `<style>` block.**

### Colours

| Variable | Value | Role |
|---|---|---|
| `--color-bg` | `#faf6f0` | Page background (warm off-white) |
| `--color-white` | `#ffffff` | Card and element backgrounds |
| `--color-text` | `#111111` | Primary text; also the footer background |
| `--color-border` | `#111111` | All borders and shadows |
| `--color-primary` | `#ff4d4d` | CTAs, links, active states, errors |
| `--color-yellow` | `#ffd23f` | Hero backgrounds, highlights, hover fills |
| `--color-blue` | `#4d94ff` | Info, in-progress, research |
| `--color-green` | `#00cc99` | Done / complete |
| `--color-orange` | `#ff8c42` | Community / building now |
| `--color-purple` | `#9d4edd` | Future / announcement |
| `--color-text-on-yellow` | `#111111` | Text on a yellow surface |

Legacy aliases also exist and are still referenced: `--color-primary-600/700`, `--color-gray-50/100/300/400/500/900`, `--color-success-600`, `--color-warning-600`, `--color-error-600`.

### Typography

| Variable | Value | Use |
|---|---|---|
| `--font-family-display` | `'Space Grotesk', system-ui, sans-serif` | Headings, nav, badges, labels, buttons |
| `--font-family-base` | `'Outfit', 'Be Vietnam Pro', system-ui, sans-serif` | Body text, descriptions, captions |

Sizes: `--text-xs` `.75rem` · `--text-sm` `.875rem` · `--text-base` `1rem` · `--text-lg` `1.125rem` · `--text-xl` `1.25rem` · `--text-2xl` `1.5rem` · `--text-3xl` `2rem`.
Weights: `--font-normal` 400 · `--font-medium` 500 · `--font-semibold` 600 · `--font-bold` 700 · `--font-extrabold` 800.

Use `800` for page and section titles, `700` for nav and sub-headings, `500` for body copy, `400` for long-form blog reading. Hero titles use `clamp(2.5rem, 6vw, 4rem)` — always fluid.

**The Google Fonts link lives once in `src/app.html`.** Do not add a `<link>` to a page or component; the per-page copies were removed in Aug 2026.

### Borders, shadows, radii, spacing

| Variable | Value | Use |
|---|---|---|
| `--border-thick` | `3px solid var(--color-border)` | Cards, nav, hero, structural elements |
| `--border-thin` | `2px solid var(--color-border)` | Inline labels, progress tracks, dividers |
| `--shadow-solid` | `6px 6px 0 var(--color-border)` | Feature cards, primary CTAs |
| `--shadow-solid-sm` | `4px 4px 0` | Smaller cards, badges, secondary buttons |
| `--shadow-solid-xs` | `2px 2px 0` | Chips, dense controls |
| `--shadow-solid-hover` | `10px 10px 0` | Hover lift only — never on a static element |
| `--radius-sm / md / lg / pill` | `8px / 16px / 24px / 999px` | Tags · cards, inputs · feature cards · buttons, chips |

Aliases `--shadow-sm/md/lg` map onto the solid set. Spacing scale: `--space-1…16` (`0.25rem` → `4rem`). Layout: `--nav-height: 56px` — tool pages inset from the top by this. Breakpoints: `--bp-tablet 768px`, `--bp-desktop 1024px` (the tool shells use a hard `900px` mobile cut-off).

---

## CSS files

All stylesheets live in `src/styles/` and are reached via the `$styles` alias. `global.css` imports `tokens.css` plus the five always-on component sheets; everything else is imported by the component or route that needs it, so a page only pays for what it uses.

| File | Loaded by | Scope |
|---|---|---|
| `tokens.css` | `global.css` | every custom property |
| `global.css` | root layout | entry point |
| **components/** | | shared widgets |
| `buttons.css` | `global.css` | `.action-btn`, `.pill-btn` and variants |
| `nav-buttons.css` | `global.css` | nav-bar button chrome |
| `editorial.css` | `global.css` | hero, section-card, chips, footer, nav |
| `modal.css` | `global.css` | generic modal scaffolding |
| `sidebar.css` | `global.css` + `SidebarCard` | sidebar card frame |
| `admin-modals.css` | `MapEditModal`, `NeatlineEditor` | admin modal chrome |
| `catalog.css` | `CatalogGrid`, `CatalogCard`, `/catalog` | map card grid |
| `search-panel.css` | `features/catalog/search/SearchPanel` + its two tabs | unified search overlay |
| `shapes-table.css` | `OcrSidebar`, `OcrRunBar`, `TraceSidebar` | the shared contribute data table |
| `tool-sidebar.css` | `TriageSidebar`, `SegSidebar` | tool sidebar form controls |
| `auth-gate.css` | `AuthGate`, `StudioMode`, `CreateMode` | signed-out gate |
| `library.css` | `LibraryGrid`, `StudioMode`, `CreateMode` | project/story library grid |
| **layouts/** | | page shells |
| `tool-page.css` | every IIIF-canvas tool + `/image` | tool page frame, panels, toolbars |
| `mode-shared.css` | `ToolLayout`, `ImageShell`, `MapModeOverlays`, `/explore` | map-mode chrome + the z-index scale |
| `catalog.css` | `/catalog` | catalog page layout |
| `home.css` | `/` | home page layout |
| `create-mode.css` | `CreateMode`, `StudioMode` | story/annotation editor layout |
| **pages/** | | one per editorial page |
| `about.css`, `blog.css`, `blog-post.css`, `profile.css`, `admin-scout.css`, `admin-bulk.css` | their route (`admin-bulk.css` also by `GeorefSyncPanel`) | page-specific |

`layouts/admin.css` and `components/label.css` were deleted in Aug 2026 — the three surviving `label.css` classes moved into `tool-page.css`. Do not reintroduce either name.

**Import form:**

```svelte
<script lang="ts">
  import '$styles/layouts/tool-page.css';
</script>
```

---

## Components

The shared editorial classes live in `src/styles/components/editorial.css` and are global. Use them without redefining the CSS.

`.top-nav` `.nav-logo` `.nav-links` `.nav-link` `.nav-auth` · `.editorial-hero` `.hero-inner` `.label-chip` `.text-highlight` · `.editorial-main` `.section-card` `.section-card-header` `.section-title` `.section-title-sm` `.section-desc` `.icon-blob` · `.badge-chip` with `.chip-blue` / `.chip-green` / `.chip-yellow` · `.action-btn` `.pill-btn` · `.editorial-footer`.

### Hero

```html
<header class="editorial-hero">
  <div class="hero-inner">
    <div class="label-chip">Page context</div>
    <h1 class="hero-title">
      Bold headline<br />
      <span class="text-highlight">highlighted word.</span>
    </h1>
    <p class="hero-sub">Supporting paragraph. Max ~500px wide.</p>
    <span class="badge-chip chip-green">Fact one</span>
    <span class="badge-chip chip-blue">Fact two</span>
  </div>
</header>
```

`.text-highlight` (white fill, black stroke, offset shadow) belongs on one or two words of a hero title — never in body text. Only `.chip-blue`, `.chip-green` and `.chip-yellow` exist; the orange/purple/red chip classes were removed.

### Section card

```html
<div class="section-card">
  <div class="section-card-header">
    <div class="icon-blob color-blue">📊</div>
    <div>
      <h2 class="section-title-sm">Section heading</h2>
      <p class="section-desc">One or two sentences.</p>
    </div>
  </div>
  <!-- content -->
</div>
```

`.icon-blob` modifiers: `.color-green`, `.color-blue`, `.color-orange`, `.color-yellow`, `.color-purple`.

### Buttons

`.action-btn.primary-btn` (red, white text) and `.action-btn.secondary-btn` (white, dark text) for CTAs — both lift on hover with `translate(-3px,-3px)` plus the larger shadow. `.pill-btn` for small utility actions (sign out, toggles).

---

## Page template

Nav and footer come once from `src/routes/(editorial)/+layout.svelte`. A new editorial page renders only its own body:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import '$styles/pages/my-page.css';

  let mounted = false;
  onMount(() => {
    mounted = true;
  });
</script>

<svelte:head>
  <title>Page Title — Vietnam Map Archive</title>
  <meta name="description" content="…" />
</svelte:head>

<div class="page my-page" class:mounted>
  <header class="editorial-hero">
    <div class="hero-inner">
      <div class="label-chip">Section label</div>
      <h1 class="hero-title">Page headline<br /><span class="text-highlight">key phrase.</span></h1>
      <p class="hero-sub">Supporting sentence.</p>
    </div>
  </header>

  <main class="editorial-main">
    <!-- .section-card blocks -->
  </main>
</div>

<style>
  .page {
    min-height: 100vh;
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  .page.mounted {
    opacity: 1;
  }
</style>
```

`.editorial-main` constrains to `1100px` with `4rem 1.5rem` padding and a `3.5rem` gap between sections.

---

## Rules

**Always**

- Use `var(--color-*)`, `var(--border-*)`, `var(--shadow-*)`, `var(--radius-*)` — a hex literal in a component `<style>` block is a bug. (The two legitimate exceptions are OpenLayers JS style objects, which cannot read CSS variables, and brand SVG fills.)
- `border: var(--border-thick)` on every card and structural container.
- `--font-family-display` for headings and labels; `--font-family-base` for body.
- Left-align editorial hero content.
- Add `class:mounted` with the `opacity: 0 → 1` fade-in on the root `.page`.
- `aria-expanded` on any toggle or disclosure; collapsible regions use `{#if}`, not `display: none`.

**Never**

- `transform: rotate()` on an editorial page.
- Emoji in `<h1>`/`<h2>` — they go inside `.icon-blob` or inline in body copy.
- Hardcoded font sizes — `clamp()` for headlines, tokens for everything else.
- A per-page Google Fonts `<link>` — it is in `app.html`.
- `--shadow-solid-hover` on a static element; it is a hover state.
- A new page without nav + footer links.

**Adding a new public page**

1. Copy the template above into `src/routes/(editorial)/<page>/+page.svelte`.
2. Add its stylesheet at `src/styles/pages/<page>.css` and import it in the page.
3. Add the link to `src/lib/ui/NavBar.svelte` and `src/lib/ui/EditorialFooter.svelte`.
4. Add a row to the route map in `docs/system-guidelines.md` §2.
5. Build content from `.editorial-main` + `.section-card`; don't invent new layout patterns.

---

## Colour × state reference

| State | Token | Example |
|---|---|---|
| Complete / done | `--color-green` | finished pipeline stage, milestone check |
| Active / in progress | `--color-blue` | current phase, research chips |
| Community / people | `--color-orange` | contributor cards, low-res tile priority |
| Future | `--color-purple` | roadmap items |
| Hero / highlight | `--color-yellow` | hero background, hover fill |
| CTA / danger | `--color-primary` | primary buttons, error messages |
| Neutral | `--color-text` / `--color-bg` | body, cards, footer |
