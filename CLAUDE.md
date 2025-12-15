# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a SvelteKit 5 application that integrates Allmaps (@allmaps) libraries for georeferencing historical maps. The app uses OpenLayers and MapLibre for interactive map rendering, allowing users to overlay georeferenced historical maps on modern basemaps.

## Development Commands

```bash
# Start development server
npm run dev

# Start dev server and open in browser
npm run dev -- --open

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run check

# Type checking in watch mode
npm run check:watch

# Sync SvelteKit types (runs automatically in prepare)
svelte-kit sync
```

## Architecture

### Framework & Rendering

- **SvelteKit 5**: Uses the new Svelte 5 runes system (`$state`, `$derived`, reactive `$:` statements)
- **TypeScript**: Strict mode enabled with bundler module resolution
- **Adapter**: Configured with `@sveltejs/adapter-cloudflare` for Cloudflare Pages deployment

### Map Libraries Integration

The app integrates two separate map rendering libraries:

1. **MapLibre GL** (`src/lib/Map.svelte`)
   - Uses `@allmaps/maplibre` for warped map layers
   - Lightweight component for simple map embedding
   - Requires `PUBLIC_MAPTILER_KEY` environment variable (falls back to demo tiles)

2. **OpenLayers** (`src/lib/map/MapViewport.svelte`)
   - Primary viewer implementation with `@allmaps/openlayers`
   - Full-featured with annotation drawing, story scenes, and view modes
   - Supports overlay, side-by-side (x/y), and spy glass viewing modes
   - Google Maps basemap tiles (streets and satellite)

### Key Components

**Viewer System** (`src/lib/viewer/`)
- `Viewer.svelte`: Main entry point for the full-featured map viewer
- `MapViewport.svelte`: Core OpenLayers integration (very large file ~45k+ tokens)
- `types.ts`: TypeScript definitions for annotations, story scenes, view modes
- `annotations.ts`: Utilities for creating annotation styles, managing feature defaults
- `constants.ts`: Basemap definitions, default colors, drawing type mappings

**State Management** (`src/lib/map/stores/`)
- `annotationState.ts`: Svelte store for annotation list and selection state
- `annotationHistory.ts`: Undo/redo functionality with feature snapshots
- Uses Svelte context API (`src/lib/map/context/annotationContext.ts`) to avoid prop drilling

**Layout Components** (`src/lib/layout/`)
- `Container.svelte`, `Stack.svelte`, `Cluster.svelte`: Layout primitives
- `breakpoints.ts`: Responsive breakpoint definitions

### Data Flow

1. Historical maps are loaded via:
   - Allmaps annotation IDs (16-char hex strings)
   - Allmaps annotation URLs (annotations.allmaps.org)
   - IIIF manifest/image URLs (fetches annotations from Allmaps API)
   - GeoreferencedMap objects directly

2. Annotations (points, lines, polygons) are:
   - Created using OpenLayers Draw interactions
   - Stored as GeoJSON features with properties: `id`, `label`, `color`, `details`, `hidden`
   - Managed through custom Svelte stores with undo/redo history
   - Persisted to localStorage under key `vma-viewer-state-v1`

3. Story scenes allow multi-step map narratives with:
   - Camera positions (center, zoom, rotation)
   - Visibility toggles per annotation
   - Delay timings between scenes
   - View mode and opacity settings

### Styling

- Global CSS in `src/styles/global.css`
- CSS custom properties (design tokens) in `src/styles/tokens.css`
- Component-specific styles in `src/styles/components/`
- MapLibre and OpenLayers CSS imported via npm packages

## Important Implementation Details

### Working with Annotations

- All features must have: `id`, `label`, `color`, `hidden` properties
- Use `ensureAnnotationDefaults(feature)` to initialize missing properties
- Feature IDs generated via `randomId()` using crypto.randomUUID() when available
- Default annotation color: `#2563eb` (blue)
- Hidden annotations return `undefined` from the style function to hide them

### Svelte Context Pattern

The annotation stores use Svelte's context API:
```typescript
// In parent component
setAnnotationContext({ history, state });

// In child components
const { state } = getAnnotationContext();
$: selectedId = $state.selectedId;
```

### Large File Warning

`src/lib/map/MapViewport.svelte` exceeds 45,000 tokens. When modifying, use targeted edits with offset/limit parameters or grep for specific sections.

### Environment Variables

- `PUBLIC_MAPTILER_KEY`: Optional MapTiler API key for MapLibre basemap (Map.svelte only)
- Without the key, falls back to MapLibre demo tiles with console warning

## Deployment

The project is configured for Cloudflare Pages:
- Build command: `npm run build`
- Output directory: `.svelte-kit/cloudflare`
- Local preview: `npx wrangler pages dev .svelte-kit/cloudflare`

## Testing Strategy

- Type checking via `svelte-check` is the primary verification method
- No test runner configured currently
- Validate changes with `npm run check` before committing
