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
  webServer: [
    // Most tests stub the API with page.route. The multi-user room test needs the real server and sockets,
    // which run against a throwaway in-memory MongoDB (see apps/server/src/test/e2eServer.ts).
    {
      command: 'pnpm --filter @studibrowse/server e2e:server',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: !isCI,
      // The first run downloads a MongoDB binary.
      timeout: 180_000,
    },
    {
      command: 'pnpm --filter @studibrowse/web dev',
      url: WEB_URL,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
