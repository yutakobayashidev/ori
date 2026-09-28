import type { KnipConfig } from "knip";

export default {
  entry: ["playwright.config.ts", "e2e/**/*.test.ts", "e2e/mock-relay.mjs"],
  playwright: false,
} satisfies KnipConfig;
