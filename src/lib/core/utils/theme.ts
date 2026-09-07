/**
 * theme.ts — which of the two faces of the palette the reader sees.
 *
 * `tokens.css` writes every ink as `light-dark(light, dark)` and picks by the
 * used `color-scheme`. So all this has to do is put one attribute on <html>:
 *
 *   no attribute       → :root keeps `color-scheme: light dark`, the OS decides
 *   data-theme=light   → :root switches to `color-scheme: light`
 *   data-theme=dark    → :root switches to `color-scheme: dark`
 *
 * It lives in `core` rather than beside NavBar because `ui` may not import
 * `features` or `data` (layering rule) — the same reason `commandPalette.ts`
 * is here. The stored value is a bare string, not JSON, because the boot script
 * in `src/app.html` reads the same key before any bundle loads and a raw string
 * is one `getItem` there instead of a `JSON.parse` in a try/catch.
 */
import { readable, writable, derived, type Readable } from 'svelte/store';

export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_KEY = 'vma-theme';

/** The cycle the toggle walks, in order. */
export const THEME_CYCLE: readonly ThemeChoice[] = ['system', 'light', 'dark'];

function stored(): ThemeChoice {
  if (typeof localStorage === 'undefined') return 'system';
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** The reader's choice. `system` means no attribute and no stored value. */
export const theme = writable<ThemeChoice>(stored());

export function setTheme(choice: ThemeChoice): void {
  theme.set(choice);
  if (typeof document === 'undefined') return;
  if (choice === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // A private window with storage blocked still themes for this page view.
  }
}

/**
 * Whether the OS asks for dark right now. A store rather than a call, because
 * a reader on `system` who flips their OS theme mid-session has to be told:
 * CSS hears the media query by itself, but anything painting to a canvas — the
 * OpenLayers basemap — does not.
 */
const systemPrefersDark: Readable<boolean> = readable(false, (set) => {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const q = window.matchMedia('(prefers-color-scheme: dark)');
  set(q.matches);
  const onChange = (e: MediaQueryListEvent) => set(e.matches);
  q.addEventListener('change', onChange);
  return () => q.removeEventListener('change', onChange);
});

/** The theme actually in force, `system` resolved. */
export const isDarkTheme: Readable<boolean> = derived(
  [theme, systemPrefersDark],
  ([choice, prefersDark]) => (choice === 'system' ? prefersDark : choice === 'dark')
);

/** The next choice after `current`, wrapping. */
export function nextTheme(current: ThemeChoice): ThemeChoice {
  return THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
}

/** What the toggle should say it does, given where it is now. */
export function themeLabel(current: ThemeChoice): string {
  const next = nextTheme(current);
  const name = { system: 'follow the system', light: 'light', dark: 'dark' } as const;
  return `Theme: ${name[current]} — switch to ${name[next]}`;
}
