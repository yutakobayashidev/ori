import type { KnipConfig } from "knip";

export default {
  entry: [
    "playwright.config.ts",
    "e2e/**/*.{test,spec}.ts",
    "e2e/mock-relay.mjs",
    "public/sw.js",
    "scripts/events-worker.ts",
  ],
  playwright: false,
} satisfies KnipConfig;
