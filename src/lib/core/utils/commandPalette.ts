/**
 * commandPalette.ts — open/closed state for the app-wide search palette.
 *
 * It lives in `core` rather than beside the component because `ui/NavBar` opens
 * it and the layering rule bars `ui` from importing `features`. A boolean store
 * is pure, so it is at home here; the palette itself is
 * `features/shared/CommandPalette.svelte`, mounted once by the root layout.
 */
import { writable } from 'svelte/store';

export const paletteOpen = writable(false);

/**
 * Text the palette should start with, consumed and cleared by the palette when
 * it opens. The home page's search field and its "Try:" chips hand the reader's
 * first keystroke straight through, so typing into the hero is typing into the
 * palette rather than a field that throws the character away.
 */
export const paletteSeed = writable('');

export function openPaletteWith(seed: string): void {
  paletteSeed.set(seed);
  paletteOpen.set(true);
}

/** Zero-argument on purpose: it is used directly as an `on:click` handler. */
export const openPalette = () => openPaletteWith('');
export const closePalette = () => paletteOpen.set(false);
export const togglePalette = () => paletteOpen.update((v) => !v);

/** True for the keystroke that opens the palette: ⌘K on a Mac, Ctrl+K elsewhere. */
export function isPaletteShortcut(e: KeyboardEvent): boolean {
  return e.key?.toLowerCase() === 'k' && !!(e.metaKey || e.ctrlKey) && !e.altKey;
}

/**
 * Whether a keystroke should be left to the page. The palette's global listener
 * must not steal `/` from someone typing into a form.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable === true
  );
}
