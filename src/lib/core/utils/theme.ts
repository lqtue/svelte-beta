/**
 * theme.ts — which of the two faces of the palette the reader sees.
 *
 * `tokens.css` writes every ink as `light-dark(light, dark)` and picks by the
 * used `color-scheme`. So all this has to do is put one attribute on <html>:
 *
 *   data-theme=light   → :root switches to `color-scheme: light`
 *   data-theme=dark    → :root switches to `color-scheme: dark`
 *
 * There are two choices, not three: the toggle is light ⇄ dark. The OS is
 * consulted once, for a reader who has never chosen — after that the choice is
 * pinned, and flipping the OS theme mid-session no longer moves the page.
 *
 * It lives in `core` rather than beside NavBar because `ui` may not import
 * `features` or `data` (layering rule) — the same reason `commandPalette.ts`
 * is here. The stored value is a bare string, not JSON, because the boot script
 * in `src/app.html` reads the same key before any bundle loads and a raw string
 * is one `getItem` there instead of a `JSON.parse` in a try/catch.
 */
import { writable, derived, type Readable } from 'svelte/store';

export type ThemeChoice = 'light' | 'dark';

export const THEME_KEY = 'vma-theme';

function stored(): ThemeChoice {
  if (typeof localStorage === 'undefined') return 'light';
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // A private window with storage blocked still themes for this page view.
  }
  // Never chosen: start where the OS is, then stay there.
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** The reader's choice. */
export const theme = writable<ThemeChoice>(stored());

export function setTheme(choice: ThemeChoice): void {
  theme.set(choice);
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = choice;
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    // A private window with storage blocked still themes for this page view.
  }
}

/** The theme actually in force. Anything painting to a canvas — the
 * OpenLayers basemap — has to be told; CSS hears the attribute by itself. */
export const isDarkTheme: Readable<boolean> = derived(theme, (choice) => choice === 'dark');

/** The other one. */
export function nextTheme(current: ThemeChoice): ThemeChoice {
  return current === 'dark' ? 'light' : 'dark';
}

/** What the toggle should say it does, given where it is now. */
export function themeLabel(current: ThemeChoice): string {
  return `Theme: ${current} — switch to ${nextTheme(current)}`;
}
