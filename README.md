# Vietnam Map Archive

A SvelteKit 5 application for exploring georeferenced historical maps of Vietnam. Built with Allmaps, OpenLayers, and MapLibre for interactive visualization of heritage cartography overlaid on modern basemaps.

## Features

- **Historical Map Viewer** — Explore georeferenced vintage maps with annotation tools (points, lines, polygons)
- **Trip Tracker** — Real-time GPS tracking on historical maps with breadcrumb trails and compass heading
- **Multiple View Modes** — Overlay, side-by-side, and spy glass comparisons
- **Annotation System** — Draw and label features with undo/redo history
- **Offline Support** — Service worker caching for field use
- **Bilingual** — English and Vietnamese with typography optimization

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | SvelteKit 5 (Svelte runes) |
| Language | TypeScript (strict) |
| Maps | OpenLayers 10, MapLibre GL 5 |
| Georeferencing | Allmaps (@allmaps/openlayers, @allmaps/maplibre) |
| Deployment | Cloudflare Pages |
| Build | Vite 7 |

## Project Structure

```
src/
├── routes/
│   ├── +page.svelte          # Map viewer
│   └── trip/+page.svelte     # Trip tracker
├── lib/
│   ├── viewer/               # Annotation viewer components
│   ├── trip/                 # GPS tracking & offline features
│   ├── map/                  # Core map & annotation stores
│   └── layout/               # Layout primitives
└── styles/                   # Global CSS & design tokens
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PUBLIC_MAPTILER_KEY` | No | MapTiler API key for MapLibre basemap (falls back to demo tiles) |

## Deployment

Configured for Cloudflare Pages:

```bash
# Build
npm run build

# Local preview with Wrangler
npx wrangler pages dev .svelte-kit/cloudflare
```

---

## Roadmap

### Phase 1: Homepage & Domain Setup

- [ ] **Design and build a landing page** at `/`
  - Hero section introducing the project with a featured historical map
  - Overview of map collections by city/region
  - Quick links to viewer (`/viewer`) and trip tracker (`/trip`)
  - About section with project mission and credits
- [ ] **Configure custom domain**
  - Add custom domain in Cloudflare Pages dashboard
  - Set up DNS records (CNAME or A record pointing to Cloudflare)
  - Verify SSL/TLS is active
- [ ] **SEO & social sharing**
  - Add meta tags (title, description, keywords)
  - Open Graph tags for social previews
  - Favicon and app icons

### Phase 2: Content & Discovery

- [ ] Map collection browser with search and filters
- [ ] City/region navigation (Saigon, Hanoi, Hue, Da Nang, etc.)
- [ ] Individual map detail pages with historical context
- [ ] Curated story tours through map collections
- [ ] Timeline view showing maps by date

### Phase 3: User Features

- [ ] User accounts for saved annotations
- [ ] Shareable annotation URLs
- [ ] Collaborative editing sessions
- [ ] Export annotations as GeoJSON/KML
- [ ] Compare two maps side-by-side

### Phase 4: Performance & Polish

- [ ] Image optimization and lazy loading
- [ ] Enhanced offline/PWA capabilities
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Analytics integration
- [ ] Performance monitoring

---

## Development Notes

- Run `npm run check` before committing to verify TypeScript types
- Follow Svelte 5 runes patterns (`$state`, `$derived`, `$effect`)
- The main `MapViewport.svelte` file is large (~45k tokens) — use targeted edits
- Annotations require properties: `id`, `label`, `color`, `hidden`

## License

[Add license]
