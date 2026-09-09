/**
 * The front page server-renders. It used to be `ssr = false`, because the hero
 * was a live OpenLayers map and there was nothing to render without it; the
 * header is one image now, so the masthead, the search field and the whole
 * lower half of the page arrive in the HTML — and the LCP image is discovered
 * by the preload scanner instead of after hydration.
 *
 * The catalog below still loads in `onMount` against the browser Supabase
 * client, so it server-renders as "Opening the archive…".
 */
