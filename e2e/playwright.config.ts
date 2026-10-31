import { defineConfig, devices } from '@playwright/test';

const WEB_URL = 'http://localhost:5173';
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? 'github' : 'list',
  outputDir: '../test-results',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Tests stub the API with page.route, so only the web app has to run.
  webServer: {
    command: 'pnpm --filter @studibrowse/web dev',
    url: WEB_URL,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});
