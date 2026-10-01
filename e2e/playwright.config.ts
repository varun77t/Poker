import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the production build: one Node process serving the built client and
 * Socket.IO on port 4173, exactly as it will run when deployed. Real timers, real bots.
 * Set E2E_BASE_URL (e.g. https://private-holdem.onrender.com) to run the same tests against a live
 * deployment instead; no local server is started then.
 */
const PORT = 4173;
const LIVE_URL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './tests',
  // Players share one server; the specs run one at a time so their rooms and timers don't compete.
  workers: 1,
  fullyParallel: false,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]],
  outputDir: '../test-results',
  use: {
    baseURL: LIVE_URL ?? `http://localhost:${PORT}`,
    ...devices['Desktop Chrome'],
    viewport: { width: 1536, height: 700 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: LIVE_URL
    ? undefined
    : {
        command: 'npm run build && npm run start',
        cwd: '..',
        url: `http://localhost:${PORT}/health`,
        env: { PORT: String(PORT), LOG_LEVEL: 'warn' },
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
