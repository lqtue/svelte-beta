/**
 * theme.spec.ts — both faces of the palette have to be readable.
 *
 * `tokens.css` writes each ink as `light-dark(light, dark)`. Nothing in the
 * build checks the dark half, and a dark theme fails quietly: text that is
 * merely hard to read looks fine to whoever picked the colour. So the numbers
 * claimed in the comments there are asserted here, parsed straight out of the
 * stylesheet, for both themes.
 *
 * Thresholds follow what each token is actually used for, WCAG 2.1 AA:
 *   text          4.5, and body text 7.0 (AAA) because it always was in light
 *   accent fills  3.0 — primary, orange, green and purple are backgrounds,
 *                 borders and swatches; the only one used as text is blue
 *   borders/rules 3.0, the UI-boundary floor
 *
 * Recorded while writing this: `--color-orange` is 3.92 on the light ground
 * and 4.44 on a light card. The comment in tokens.css claims 4.8, measured
 * against a pure white that the plate-tone pass removed. It is fine as a fill,
 * which is all it is used for — but it must not become label text in light
 * without being darkened first (#9c5726 would clear 4.5 on both).
 */
import { readFileSync } from 'node:fs';

import { test, expect } from '@playwright/test';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

/** A hex, or `var(--other)` pointing at one — resolved one hop, which is all
 * tokens.css uses (the light faces are named `--light-*` so a surface that
 * stays light can pin them). */
function resolve(value: string, depth = 0): string {
  const hop = value.match(/^var\((--[a-z0-9-]+)\)$/i);
  if (!hop) return value;
  if (depth > 4) throw new Error(`token cycle at ${value}`);
  const target = css.match(new RegExp(`${hop[1]}:\\s*([^;]+);`, 'i'));
  if (!target) throw new Error(`no such token: ${hop[1]}`);
  return resolve(target[1].trim(), depth + 1);
}

/**
 * `--name: light-dark(a, b);` and plain `--name: a;` alike, where each side is
 * a hex or a `var()` hop. Whitespace is anything, because prettier wraps a long
 * declaration across three lines.
 */
function token(name: string): { light: string; dark: string } {
  const pair = css.match(
    new RegExp(`${name}:\\s*light-dark\\(\\s*([^,]+?),\\s*([^)]+?)\\s*\\)`, 'i')
  );
  if (pair) return { light: resolve(pair[1].trim()), dark: resolve(pair[2].trim()) };
  const flat = css.match(new RegExp(`${name}:\\s*([^;]+);`, 'i'));
  if (!flat) throw new Error(`no such token: ${name}`);
  const v = resolve(flat[1].trim());
  return { light: v, dark: v };
}

/** Relative luminance, per WCAG. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const chan = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = ['light', 'dark'] as const;

test('the palette is parsed, not assumed', () => {
  // A typo in a token name would otherwise make every assertion below vacuous.
  expect(token('--color-bg').light).toBe('#eae7e0');
  expect(token('--color-bg').dark).not.toBe(token('--color-bg').light);
  expect(css).toContain('color-scheme: light dark');
});

for (const theme of THEMES) {
  const t = (name: string) => token(name)[theme];

  test(`${theme}: body text clears AAA on both surfaces`, () => {
    expect(contrast(t('--color-text'), t('--color-bg'))).toBeGreaterThanOrEqual(7);
    expect(contrast(t('--color-text'), t('--color-white'))).toBeGreaterThanOrEqual(7);
  });

  test(`${theme}: meta text clears AA on both surfaces`, () => {
    expect(contrast(t('--color-gray-500'), t('--color-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t('--color-gray-500'), t('--color-white'))).toBeGreaterThanOrEqual(4.5);
  });

  test(`${theme}: every accent reads as a fill on both surfaces`, () => {
    for (const name of [
      '--color-primary',
      '--color-blue',
      '--color-green',
      '--color-orange',
      '--color-purple',
    ]) {
      expect(contrast(t(name), t('--color-bg')), `${name} on bg`).toBeGreaterThanOrEqual(3);
      expect(contrast(t(name), t('--color-white')), `${name} on card`).toBeGreaterThanOrEqual(3);
    }
  });

  test(`${theme}: blue clears AA, because it is link text`, () => {
    // --color-primary-600 aliases it and the editorial pages use it for links.
    expect(contrast(t('--color-blue'), t('--color-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t('--color-blue'), t('--color-white'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t('--color-primary-700'), t('--color-white'))).toBeGreaterThanOrEqual(4.5);
  });

  test(`${theme}: borders and rules clear the UI-boundary floor`, () => {
    expect(contrast(t('--color-border'), t('--color-bg'))).toBeGreaterThanOrEqual(3);
    expect(contrast(t('--color-border'), t('--color-white'))).toBeGreaterThanOrEqual(3);
    expect(contrast(t('--rule'), t('--color-bg'))).toBeGreaterThanOrEqual(3);
  });

  test(`${theme}: ink on the hover yellow stays readable`, () => {
    // Yellow is a light surface in both themes, so the ink on it never flips.
    expect(contrast(t('--color-text-on-yellow'), t('--color-yellow'))).toBeGreaterThanOrEqual(4.5);
  });

  test(`${theme}: the footer's ochre links read on the ink plate`, () => {
    // The footers are pinned ink in both themes (.on-ink-plate) precisely so
    // this pair holds — unpinned, the slab inverted and the links sat on paper
    // at about 1.8:1. Both sides are fixed, so the number is the same in each
    // theme; the test runs in both to catch a token being un-pinned.
    expect(
      contrast(token('--color-yellow')[theme], token('--light-ink').light)
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(token('--light-paper').light, token('--light-ink').light)
    ).toBeGreaterThanOrEqual(7);
  });

  test(`${theme}: the offset shadow reads against the card it falls from`, () => {
    // Not a contrast requirement — a visibility one. The drop has to differ
    // from both the card above it and the ground behind it, or it disappears.
    // Dark has little room below the ground, so the floor there is low on
    // purpose: 1.3 against the card is a hint of a second plate, not a shadow.
    expect(contrast(t('--shadow-ink'), t('--color-white'))).toBeGreaterThanOrEqual(1.3);
    expect(contrast(t('--shadow-ink'), t('--color-bg'))).toBeGreaterThanOrEqual(1.15);
  });
}
