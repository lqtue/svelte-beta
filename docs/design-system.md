# VMA Design System

The visual language for Vietnam Map Archive. Applied to all public pages: Home, About, Blog, Knowledge Graph, Timeline, Sources, Contribute, and any new routes.

---

## Philosophy

**Neo-brutalist editorial.** Bold borders, offset shadows, flat fills — applied with editorial restraint. Not a playful toy, not a generic SaaS dashboard. A serious archive made legible and memorable.

Two registers coexist:
- **Editorial** (About, Blog, KG, Timeline, Sources) — clean, left-aligned, information-dense, readable at pace
- **Playful map browser** (homepage map grid, viewer) — can use hover animations, favorites, map thumbnails

All new public pages default to the **editorial** register.

---

## Tokens

Defined in `src/styles/tokens.css`. Never hardcode colors, shadows, or radii — always use variables.

### Colors

| Variable | Default | Role |
|---|---|---|
| `--color-bg` | `#faf6f0` | Page background (warm off-white) |
| `--color-white` | `#ffffff` | Card and element backgrounds |
| `--color-text` | `#111111` | Primary text; also used as footer background |
| `--color-border` | `#111111` | All borders and shadows |
| `--color-primary` | `#ff4d4d` | CTAs, links, active states |
| `--color-yellow` | `#ffd23f` | Hero backgrounds, highlights, hover states |
| `--color-blue` | `#4d94ff` | Info, announcements, research category |
| `--color-green` | `#00cc99` | Done/complete states, foundation phase |
| `--color-orange` | `#ff8c42` | Community/in-progress states |
| `--color-purple` | `#9d4edd` | Phase 3, future, announcements |

**Semantic uses:**
- Yellow hero → homepage, about, blog, any new landing section
- Green → "done", "foundation", "complete"
- Blue → "in progress", "research", "phase 2"
- Orange → "community", "building now", "phase 1 community work"
- Purple → "phase 3", "future", "announcement"
- Red/primary → CTA buttons, links, error states

### Typography

| Variable | Value | Use |
|---|---|---|
| `--font-family-display` | Space Grotesk | All headings, nav, badges, labels, buttons |
| `--font-family-base` | Outfit / Be Vietnam Pro | Body text, descriptions, captions |

**Weight guide:**
- `800` (extrabold) — page titles, section headings, button text, badge text
- `700` (bold) — nav links, sub-headings, strong body labels
- `600` (semibold) — supporting text, stat labels
- `500` (medium) — body copy, descriptions, captions
- `400` (normal) — long-form reading (blog articles)

**Scale:**
- Hero title: `clamp(2.5rem, 6vw, 4rem)` — always use clamp for fluid type
- Section title: `1.75rem`
- Card title: `1.25–1.5rem`
- Body: `1rem` (desktop), `0.875rem` (mobile)
- Small/label: `0.75–0.875rem`

**Google Fonts import** (add to `<svelte:head>` on each page):
```html
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Outfit:wght@400;600;800&display=swap" rel="stylesheet" />
```

### Borders & Shadows

The offset box-shadow is the signature of the design system. It creates depth without gradients.

| Variable | Value | Use |
|---|---|---|
| `--border-thick` | `3px solid #111` | Cards, nav, hero, all structural elements |
| `--border-thin` | `2px solid #111` | Inline labels, progress tracks, subtle dividers |
| `--shadow-solid` | `6px 6px 0px #111` | Feature cards, primary CTAs |
| `--shadow-solid-sm` | `4px 4px 0px #111` | Smaller cards, badges, secondary buttons |
| `--shadow-solid-hover` | `10px 10px 0px #111` | Hover state on cards that lift |

**Rule:** Every card has `border: var(--border-thick)`. The shadow size determines visual weight — `shadow-solid` for primary content, `shadow-solid-sm` for secondary.

### Radii

| Variable | Value | Use |
|---|---|---|
| `--radius-sm` | `8px` | Small inline elements, tags |
| `--radius-md` | `16px` | Medium cards, inputs |
| `--radius-lg` | `24px` | Large feature cards |
| `--radius-pill` | `999px` | Buttons, chips, nav links |

---

## Components

All shared components are in `src/styles/components/editorial.css`, auto-imported via `global.css`. Use these class names in any new page without redefining the CSS.

### Top Nav

```html
<nav class="top-nav">
  <a href="/" class="nav-logo">VMA</a>
  <div class="nav-links">
    <a href="/" class="nav-link">Home</a>
    <a href="/about" class="nav-link">About</a>
    <a href="/blog" class="nav-link">Blog</a>
    <!-- add more links here -->
    <a href="/current-page" class="nav-link active">Current</a>
  </div>
  <ThemeToggle />
  <!-- optional: nav-auth for sign in/out -->
</nav>
```

- Logo always has `margin-right: auto` (pushes links to the right)
- Only one link has `class="nav-link active"` at a time
- Nav links hide on mobile (≤600px) — if the page needs mobile nav, add a hamburger

### Label Chip (hero eyebrow)

Small white pill above the hero title. Sets context before the headline.

```html
<div class="label-chip">About the Project</div>
<div class="label-chip">✨ Make old maps fun again.</div>
```

### Hero (editorial)

Left-aligned, yellow background. The standard opening for any editorial page.

```html
<header class="editorial-hero">
  <div class="hero-inner">
    <div class="label-chip">Page context</div>
    <h1 class="hero-title">
      Bold headline<br />
      <span class="text-highlight">highlighted word.</span>
    </h1>
    <p class="hero-sub">
      Supporting paragraph. Max ~500px wide. White semi-transparent box.
    </p>
    <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
      <span class="badge-chip chip-green">Fact one</span>
      <span class="badge-chip chip-blue">Fact two</span>
    </div>
  </div>
</header>
```

**`.text-highlight`** — white fill + black stroke + offset shadow. Use on one or two words in the hero title only, never in body text.

### Badge Chips

Color-filled status pills. Used in hero areas and stat sections.

```html
<span class="badge-chip chip-green">Done</span>
<span class="badge-chip chip-blue">In progress</span>
<span class="badge-chip chip-yellow">Open data</span>
<span class="badge-chip chip-purple">Phase 3</span>
<span class="badge-chip chip-orange">Community</span>
```

### Section Card

The primary container for sections within `editorial-main`. Always `border-thick` + `shadow-solid`.

```html
<div class="section-card">
  <div class="section-card-header">
    <div class="icon-blob color-blue">📊</div>
    <div>
      <h2 class="section-title-sm">Section Heading</h2>
      <p class="section-desc">One or two sentences describing what's in this section.</p>
    </div>
  </div>
  <!-- section content -->
</div>
```

For sections without an icon header, just use `<h2 class="section-title">` directly.

### Icon Blob

Decorative container for section emoji/icons. Organic blob shape via asymmetric border-radius.

```html
<div class="icon-blob color-yellow">✦</div>
<div class="icon-blob color-blue">📊</div>
<div class="icon-blob color-green">✅</div>
```

Available modifiers: `.color-green`, `.color-blue`, `.color-orange`, `.color-yellow`, `.color-purple`

### Action Buttons

Primary CTAs. Pill shape, thick border, offset shadow.

```html
<a href="/contribute" class="action-btn primary-btn">Start contributing</a>
<a href="/about" class="action-btn secondary-btn">Learn more</a>
<button class="action-btn secondary-btn" on:click={handler}>Do something</button>
```

- `.primary-btn` — red background, white text (highest emphasis)
- `.secondary-btn` — white background, dark text (secondary)
- Hover lifts with `translate(-3px, -3px)` + larger shadow

### Pill Buttons

Smaller utility buttons — auth, language toggles, small actions.

```html
<button class="pill-btn" on:click={handleSignOut}>Sign Out</button>
<button class="pill-btn" style="background:var(--color-blue);color:white">VN</button>
```

### Editorial Main

Constrains page content and stacks sections with consistent spacing.

```html
<main class="editorial-main">
  <section><!-- section 1 --></section>
  <section><!-- section 2 --></section>
</main>
```

Max-width: `1100px`, padding: `4rem 1.5rem`, gap between sections: `3.5rem`.

### Footer

Dark footer, identical across all editorial pages.

```html
<footer class="editorial-footer">
  <div class="footer-inner">
    <div class="footer-links">
      <a href="/">Home</a>
      <a href="/about">About</a>
      <a href="/blog">Blog</a>
      <a href="/contribute">Contribute</a>
    </div>
    <p>Built openly with <a href="https://allmaps.org" target="_blank">Allmaps</a>, ...</p>
    <p><a href="mailto:vietnamma.project@gmail.com">vietnamma.project@gmail.com</a></p>
  </div>
</footer>
```

---

## Page Template

Every new editorial page follows this skeleton:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import ThemeToggle from '$lib/ui/ThemeToggle.svelte';

  let mounted = false;
  onMount(() => { mounted = true; });
</script>

<svelte:head>
  <title>Page Title — Vietnam Map Archive</title>
  <meta name="description" content="..." />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Outfit:wght@400;600;800&display=swap" rel="stylesheet" />
</svelte:head>

<div class="page" class:mounted>
  <nav class="top-nav">
    <a href="/" class="nav-logo">VMA</a>
    <div class="nav-links">
      <a href="/" class="nav-link">Home</a>
      <a href="/about" class="nav-link">About</a>
      <a href="/blog" class="nav-link">Blog</a>
      <a href="/this-page" class="nav-link active">This Page</a>
    </div>
    <ThemeToggle />
  </nav>

  <header class="editorial-hero">
    <div class="hero-inner">
      <div class="label-chip">Section label</div>
      <h1 class="hero-title">
        Page headline<br />
        <span class="text-highlight">key phrase.</span>
      </h1>
      <p class="hero-sub">Supporting sentence. One or two lines.</p>
    </div>
  </header>

  <main class="editorial-main">
    <!-- sections go here -->
  </main>

  <footer class="editorial-footer">
    <div class="footer-inner">
      <div class="footer-links">
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/blog">Blog</a>
        <a href="/contribute">Contribute</a>
      </div>
      <p>Built openly with <a href="https://allmaps.org" target="_blank">Allmaps</a>,
         <a href="https://openlayers.org" target="_blank">OpenLayers</a>, &amp;
         <a href="https://svelte.dev" target="_blank">SvelteKit</a>.</p>
      <p><a href="mailto:vietnamma.project@gmail.com">vietnamma.project@gmail.com</a></p>
    </div>
  </footer>
</div>

<style>
  :global(body) {
    margin: 0;
    background-color: var(--color-bg);
    color: var(--color-text);
    font-family: var(--font-family-base);
  }
  .page {
    min-height: 100vh;
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  .page.mounted { opacity: 1; }
  /* page-specific styles below */
</style>
```

---

## Themes

### Default (Neo-Brutalist)
Black `#111` borders, offset box shadows, bright fills. Bold and high-contrast.

### Archival (`data-theme="archival"`)
Muted earth tones, soft drop shadows, thinner borders. Refined, museum-like.
Activated by the ThemeToggle component. All tokens remap automatically via `[data-theme="archival"]` in `tokens.css`. No custom CSS needed per component to support it.

---

## Rules

**Always**
- Use `var(--color-*)` — never hardcode hex in component CSS
- Use `border: var(--border-thick)` on all cards and structural containers
- Use `font-family: var(--font-family-display)` for headings and labels
- Use `font-family: var(--font-family-base)` for body and descriptions
- Left-align editorial hero content (not centered)
- Add `class:mounted` with `opacity: 0 → 1` fade-in on the root `.page` element
- Add `aria-expanded` on any toggle/disclosure element
- Make collapsible regions use `{#if}` (Svelte), not CSS `display:none`, for accessibility

**Never**
- Apply `transform: rotate()` on editorial pages (hero, about, blog, kg, timeline)
- Use emoji in `<h1>` or `<h2>` headings — emoji go inside `.icon-blob` containers or inline in body copy only
- Hardcode font sizes — use `clamp()` for headlines, token variables for body
- Add archival theme overrides unless the element behaves badly in archival mode
- Create a new page without adding it to the nav footer links
- Use `.shadow-solid-hover` on static elements — it's for hover states only

**Adding a new public page**
1. Copy the page template above
2. Add the route to `nav-links` in all existing pages (Home, About, Blog) and to the footer
3. Update `MEMORY.md` Route Structure table
4. Use `editorial-main` and `section-card` for content — don't invent new layout patterns unless genuinely needed

---

## Color × State Reference

| State | Color | Example use |
|---|---|---|
| Complete / done | `--color-green` | Layer L1 progress, milestone checks |
| Active / building | `--color-blue` | Layer L4 "building now", phase 2 |
| Community / people | `--color-orange` | Cartographer tier, community cards |
| Future / phase 3 | `--color-purple` | L2/L3 cards, phase 3 roadmap |
| Hero / highlight | `--color-yellow` | Hero backgrounds, hover fills |
| Danger / CTA | `--color-primary` | Primary buttons, error messages |
| Neutral | `--color-text` / `--color-bg` | Body, cards, footer |
