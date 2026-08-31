import { defineConfig, devices } from '@playwright/test';

// ponytail: chromium only, no fixtures, no global setup. Add firefox/webkit
// projects when a browser-specific bug actually shows up.
export default defineConfig({
  testDir: 'tests',
  // write.spec.ts has its own config: it needs a local Supabase and a seeded user.
  testIgnore: 'write.spec.ts',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    // SMOKE_BASE_URL points the read-only suite at a deployed preview instead
    // of a local dev server (ROADMAP A1 click-through).
    baseURL: process.env.SMOKE_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.SMOKE_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
