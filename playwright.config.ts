import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const appPort = 4173;
const relayPort = 6911;
const appCommand =
  process.env.TWITTER_LITE_E2E_PRODUCTION === "1"
    ? `HOST=127.0.0.1 PORT=${appPort} node .output/server/index.mjs`
    : `pnpm exec vite dev --host 127.0.0.1 --port ${appPort} --strictPort`;
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const databasePath =
  process.env.TWITTER_LITE_E2E_DB_PATH ??
  join(mkdtempSync(join(tmpdir(), "twitter-lite-e2e-")), "workspace.sqlite");
process.env.TWITTER_LITE_E2E_DB_PATH = databasePath;
const oidcCertificate = join(dirname(databasePath), "oidc-public-cert.pem");
const oidcEnvironment = {
  WORKSPACE_OIDC_ISSUER: "https://127.0.0.1:6913",
  WORKSPACE_OIDC_CLIENT_ID: "ori",
  WORKSPACE_OIDC_CLIENT_SECRET_FILE: resolve("e2e/fixtures/oidc-client-secret"),
  WORKSPACE_OIDC_OWNER_SUBJECT: "e2e-owner",
  WORKSPACE_MCP_RESOURCE: "https://ori.example.test/mcp",
  NODE_EXTRA_CA_CERTS: oidcCertificate,
};

if (!chromiumExecutable) {
  throw new Error(
    "PLAYWRIGHT_CHROMIUM_EXECUTABLE is required; run E2E tests with `nix develop -c pnpm test:e2e`.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/execution-app.test.ts", "**/codex-usage.test.ts"],
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${appPort}`,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { "Tailscale-User-Login": "owner@twitter-lite.invalid" },
    launchOptions: { executablePath: chromiumExecutable },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/mock-oidc.mjs",
      env: { TWITTER_LITE_E2E_OIDC_CERT: oidcCertificate },
      port: 6913,
      reuseExistingServer: false,
    },
    { command: "node e2e/mock-routine-runtime.mjs", port: 6912, reuseExistingServer: false },
    {
      command: `TWITTER_LITE_MOCK_RELAY_PORT=${relayPort} pnpm exec tsx e2e/mock-relay.mjs`,
      port: relayPort,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `TWITTER_LITE_BEEPER_CLI=./e2e/fixtures/beeper-cli.mjs TWITTER_LITE_BEEPER_TARGET=e2e-target TWITTER_LITE_CODEX_PATH= TWITTER_LITE_REPORT_ROOT= TWITTER_LITE_CODEX_MODEL= TWITTER_LITE_MASTODON_ORIGINS= TWITTER_LITE_CREDENTIAL_KEY_FILE= TWITTER_LITE_DB_PATH=${databasePath} TWITTER_LITE_JOURNAL_DIR=${join(dirname(databasePath), "journal")} TWITTER_LITE_ROUTINE_DIR=${join(dirname(databasePath), "routines")} WORKSPACE_RUNTIME_URL=http://127.0.0.1:6912 WORKSPACE_RUNTIME_TOKEN=isolated-e2e-routine-runtime TWITTER_LITE_ORIGIN=http://127.0.0.1:${appPort} TWITTER_LITE_ALLOWED_LOGIN=owner@twitter-lite.invalid TWITTER_RELAY_BASE_URL=http://127.0.0.1:${relayPort} RDT_GATEWAY_URL=http://127.0.0.1:${relayPort} BIRD_PROFILE_NAME=e2e ${appCommand}`,
      env: oidcEnvironment,
      port: appPort,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
