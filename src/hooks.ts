import type { Reroute } from '@sveltejs/kit';
import { stripLocale } from '$lib/core/i18n';

/**
 * `/vi/<path>` is the Vietnamese address of `<path>` — the same route, resolved
 * with the locale pinned by the URL instead of by a cookie.
 *
 * Universal on purpose: the same mapping has to hold for a client-side
 * navigation, or a link followed inside the app would fall out of the locale
 * the reader arrived in.
 */
export const reroute: Reroute = ({ url }) => stripLocale(url.pathname);
