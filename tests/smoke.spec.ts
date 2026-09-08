import { expect, test, type Page } from '@playwright/test';

// Opening a map tallies a row in the production map_opens table (migration 049),
// which would pollute the real per-map counts with test traffic. Any test that
// opens a map must call this first. Returns a live counter of blocked inserts.
async function blockMapOpenTally(page: Page): Promise<() => number> {
  let n = 0;
  await page.route('**/rest/v1/map_opens*', (route) => {
    if (route.request().method() === 'POST') n++;
    return route.abort();
  });
  return () => n;
}

// ponytail: read-only smokes against the dev server and the real Supabase
// project. Nothing here writes a row. The two write paths worth covering —
// saving an OCR bbox and submitting a footprint — need a logged-in user and
// would insert into production tables; they want a seeded test project first.

test('home renders and links into the catalog', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/./);
  await expect(page.locator('nav.top-nav a[href="/about"]')).toBeVisible();
  // The bar carries the reading pages directly; the tools sit behind Tools ▾,
  // whose contents are gated behind {#if open} — click to render them.
  await expect(page.locator('nav.top-nav a[href="/catalog"]')).toBeVisible();
  await page.locator('nav.top-nav button', { hasText: 'Tools' }).click();
  await expect(page.locator('nav a[href="/explore"]').first()).toBeVisible();
  await expect(page.locator('nav a[href="/directory"]').first()).toBeVisible();
});

// The hero field is a handoff, not a search: the reader's first keystroke has
// to survive the jump into the palette. Getting this wrong loses one character
// silently, which reads as a flaky keyboard rather than a bug.
test('the hero field hands its first keystrokes to the palette', async ({ page }) => {
  await page.goto('/');
  // The masthead is the hero sequence's last beat, so the field is hidden for
  // the first few seconds. Wait for it rather than typing into a hidden input,
  // which Playwright will happily do and which fires no input event at all.
  const hero = page.locator('.hero-search-input').first();
  await expect(hero).toBeVisible({ timeout: 20000 });
  await hero.pressSequentially('Catin', { delay: 40 });

  const palette = page.locator('.cp input[role="combobox"]');
  await expect(palette).toHaveValue('Catin');
  // And the field it came from is empty, so coming back shows no ghost.
  await expect(hero).toHaveValue('');

  // A suggestion chip is the same handoff with the word already chosen.
  await page.keyboard.press('Escape');
  await page.locator('.hero-try', { hasText: '1882' }).click();
  await expect(palette).toHaveValue('1882');
});

test('catalog search returns maps', async ({ page }) => {
  await page.goto('/catalog');
  await page.getByPlaceholder(/Search by title/i).fill('saigon');

  // Results come from /api/search over the tsvector column.
  const search = page.waitForResponse((r) => r.url().includes('/api/search') && r.status() === 200);
  const body = await (await search).json();
  expect(Array.isArray(body.maps)).toBe(true);
  expect(body.maps.length).toBeGreaterThan(0);
});

test('explore mounts an OpenLayers map', async ({ page }) => {
  await page.goto('/explore');
  // MapShell owns the single OL map; OL always builds a .ol-viewport canvas.
  await expect(page.locator('.shell-map canvas').first()).toBeVisible({ timeout: 20_000 });
});

test('an overlay renders on the map', async ({ page }) => {
  // Deeplinking counts as an open, so keep this one out of the tally too.
  await blockMapOpenTally(page);

  // Pick a georeferenced map from the API rather than hardcoding a UUID.
  // georef takes 'yes' | 'no', not a boolean.
  const res = await page.request.get('/api/search?georef=yes&limit=1');
  expect(res.ok()).toBe(true);
  const { maps } = await res.json();
  test.skip(!maps?.length, 'no georeferenced map in the catalogue');

  // The overlay comes from the ?map= query param; the #hash only mirrors view state.
  await page.goto(`/explore?map=${maps[0].id}`);
  await expect(page.locator('.shell-map canvas').first()).toBeVisible({ timeout: 20_000 });
  // layersStore is the single source of truth; LayerStackPanel renders it.
  await expect(page.locator('.lsp-text').first()).toBeVisible({ timeout: 20_000 });
});

test('picking a map writes ?map= and tallies the open', async ({ page }) => {
  // /explore used to be one opaque URL, so analytics could not attribute which
  // map anyone opened. syncMapParam() + recordMapOpen() fix that — assert both.

  // Aborting the insert still proves the call was made; that the server accepts
  // it is enforced by the RLS policies in migration 049.
  const tallied = await blockMapOpenTally(page);

  // The first-run tour's driver.js overlay swallows clicks on the browse rows,
  // so ack it up front the way a returning visitor would have.
  await page.addInitScript(() => localStorage.setItem('vma-explore-tour-ack-v1', 'true'));
  await page.goto('/explore');
  // Welcome chooser gates the browse panel; take the "show everything" branch.
  await page.locator('button.choice:not(.primary)').click();

  const row = page.locator('.ebp ul.rows button.row').first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();

  await expect(page).toHaveURL(/[?&]map=[0-9a-f-]{36}/);
  await expect.poll(tallied, { timeout: 10_000 }).toBe(1);

  // Tapping the same row again removes the overlay, which must drop the param
  // rather than leave a stale id behind. Removal is not an open — no new tally.
  await row.click();
  await expect(page).not.toHaveURL(/[?&]map=/);
  expect(tallied()).toBe(1);
});

test('the IIIF tool pages mount their ImageShell', async ({ page }) => {
  for (const route of ['/scan', '/scan?mode=trace', '/scan?mode=triage']) {
    await page.goto(route);
    await expect(page.locator('.tool-page')).toBeVisible();

    // tool-page.css is a global chunk now, not seven scoped copies. These two
    // declarations exist nowhere else, so they fail if the sheet stops loading.
    const styles = await page.evaluate(() => ({
      toolPage: getComputedStyle(document.querySelector('.tool-page')!).position,
      panel: getComputedStyle(document.querySelector('.panel')!).display,
    }));
    expect(styles, `${route} lost tool-page.css`).toEqual({
      toolPage: 'fixed',
      panel: 'flex',
    });
  }
});

test('auth-gated and legacy routes redirect', async ({ page }) => {
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login$/);

  // Compared as strings, not regexes: half these targets carry a `?`, which a
  // RegExp reads as "the previous character is optional" — `/explore?mode=…`
  // would quietly match nothing and the assertion would never fail honestly.
  for (const [from, to] of [
    ['/view', '/explore'],
    ['/annotate', '/explore?mode=annotate'],
    ['/studio', '/explore?mode=annotate'],
    ['/create', '/explore?mode=story'],
    ['/contribute/label', '/scan?mode=triage'],
    ['/contribute/digitalize', '/scan?mode=triage'],
    ['/contribute/trace', '/scan?mode=trace'],
    ['/image', '/scan'],
    ['/admin/bulk', '/admin?tab=bulk'],
    ['/admin/status', '/admin?tab=status'],
    ['/place/rue-catinat', '/catalog/place/rue-catinat'],
  ]) {
    await page.goto(from);
    const landed = new URL(page.url());
    expect(landed.pathname + landed.search).toBe(to);
  }
});
