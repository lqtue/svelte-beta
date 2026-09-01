import { defineConfig, devices } from '@playwright/test';

// Node's own dotenv reader (21+): the specs and the dev server both need the
// non-production credentials, and neither Playwright nor Vite loads them for us.
process.loadEnvFile('.env.test');

/**
 * Write-path smokes. Separate from playwright.config.ts because these need a
 * dev server pointed at a NON-PRODUCTION Supabase (`.env.test`, loaded by Vite
 * via `--mode test`) and a seeded fixture user.
 *
 *   supabase start
 *   node --env-file=.env.test scripts/seed-test-db.mjs
 *   npm run test:write
 */
export default defineConfig({
  testDir: 'tests',
  testMatch: 'write.spec.ts',
  timeout: 30_000,
  fullyParallel: false, // the specs share one fixture map and clean up after themselves
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite dev --port 5199 --mode test',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
