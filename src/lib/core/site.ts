/**
 * The one public address of this site.
 *
 * Canonical and `og:url` tags cannot be built from the request's own origin:
 * a preview deploy at `<hash>.vmabeta.pages.dev` would then declare itself
 * canonical and compete with production for the same content. The host that
 * `hooks.server.ts` 301s everything to is the host every tag names.
 */
export const CANONICAL_HOST = 'maparchive.vn';
export const SITE_ORIGIN = `https://${CANONICAL_HOST}`;
