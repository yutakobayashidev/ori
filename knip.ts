import type { KnipConfig } from 'knip'

export default {
  entry: [
    'playwright.config.ts',
    'tests/e2e/**/*.spec.ts',
    'tests/e2e/mock-relay.mjs',
  ],
  playwright: false,
} satisfies KnipConfig
