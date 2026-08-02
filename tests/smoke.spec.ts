import { expect, test } from '@playwright/test';

// ponytail: read-only smokes against the dev server and the real Supabase
// project. Nothing here writes a row. The two write paths worth covering —
// saving an OCR bbox and submitting a footprint — need a logged-in user and
// would insert into production tables; they want a seeded test project first.

test('home renders and links into the catalog', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle(/./);
	await expect(page.locator('nav.top-nav a[href="/about"]')).toBeVisible();
	// Dropdown contents are gated behind {#if open} — click to render them.
	await page.locator('nav.top-nav button', { hasText: 'Catalog' }).click();
	await expect(page.locator('nav a[href="/catalog"]').first()).toBeVisible();
});

test('catalog search returns maps', async ({ page }) => {
	await page.goto('/catalog');
	await page.getByPlaceholder(/Search by title/i).fill('saigon');

	// Results come from /api/search over the tsvector column.
	const search = page.waitForResponse(
		(r) => r.url().includes('/api/search') && r.status() === 200
	);
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

test('the IIIF tool pages mount their ImageShell', async ({ page }) => {
	for (const route of ['/image', '/contribute/trace', '/contribute/digitalize']) {
		await page.goto(route);
		await expect(page.locator('.tool-page')).toBeVisible();

		// tool-page.css is a global chunk now, not seven scoped copies. These two
		// declarations exist nowhere else, so they fail if the sheet stops loading.
		const styles = await page.evaluate(() => ({
			toolPage: getComputedStyle(document.querySelector('.tool-page')!).position,
			panel: getComputedStyle(document.querySelector('.panel')!).display
		}));
		expect(styles, `${route} lost tool-page.css`).toEqual({
			toolPage: 'fixed',
			panel: 'flex'
		});
	}
});

test('auth-gated and legacy routes redirect', async ({ page }) => {
	await page.goto('/profile');
	await expect(page).toHaveURL(/\/login$/);

	for (const [from, to] of [
		['/view', '/explore'],
		['/annotate', '/studio'],
		['/contribute/label', '/contribute/digitalize']
	]) {
		await page.goto(from);
		await expect(page).toHaveURL(new RegExp(`${to}$`));
	}
});
