import { defineConfig, devices } from '@playwright/test'

const appPort = 4173
const relayPort = 6911
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE

if (!chromiumExecutable) {
  throw new Error(
    'PLAYWRIGHT_CHROMIUM_EXECUTABLE is required; run E2E tests with `nix develop -c pnpm test:e2e`.',
  )
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${appPort}`,
    launchOptions: { executablePath: chromiumExecutable },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `TWITTER_LITE_MOCK_RELAY_PORT=${relayPort} node tests/e2e/mock-relay.mjs`,
      port: relayPort,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `TWITTER_RELAY_BASE_URL=http://127.0.0.1:${relayPort} BIRD_PROFILE_NAME=e2e pnpm exec vite dev --host 127.0.0.1 --port ${appPort} --strictPort`,
      url: `http://127.0.0.1:${appPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
