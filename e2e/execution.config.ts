import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import base from "../playwright.config";

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: ["integrations/execution-app.test.ts", "integrations/codex-usage.test.ts"],
  testIgnore: [],
  webServer: [
    ...(Array.isArray(base.webServer) ? base.webServer : []).map((server) => ({
      ...server,
      cwd: resolve(import.meta.dirname, ".."),
      command: `WORKSPACE_RUNTIME_URL=http://127.0.0.1:4339 WORKSPACE_RUNTIME_TOKEN=isolated-execution-app-test-token ${server.command}`,
    })),
    {
      command: "node e2e/fixtures/execution-runtime.mjs",
      cwd: resolve(import.meta.dirname, ".."),
      port: 4339,
      reuseExistingServer: false,
    },
  ],
});
