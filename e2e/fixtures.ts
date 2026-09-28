import { basename, dirname, isAbsolute } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { test as base } from '@playwright/test'
import {
  completeOnboarding,
  createOwner,
  readAuthState,
  signIn,
} from '../src/features/auth/auth.server'
import { openDatabase } from '../src/features/storage/database.server'

export const test = base.extend<{
  a11y: () => AxeBuilder
  resetDecks: undefined
  sessionToken: string
}>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixture arguments.
  sessionToken: async ({}, use) => {
    const path = process.env.TWITTER_LITE_E2E_DB_PATH
    if (!path || !basename(dirname(path)).startsWith('twitter-lite-e2e-'))
      throw new Error('Isolated E2E database is required.')
    const database = openDatabase(path)
    const credentials = {
      email: 'owner@workspace.invalid',
      password: 'E2E-only-passphrase-2026',
    }
    process.env.WORKSPACE_SETUP_TOKEN =
      'isolated-e2e-setup-token-not-for-production'
    const result = readAuthState(database).needsSetup
      ? await createOwner(
          {
            ...credentials,
            name: 'Yuta',
            setupToken: process.env.WORKSPACE_SETUP_TOKEN,
          },
          database,
        )
      : await signIn(credentials, database)
    if (!result.owner.onboardingCompletedAt)
      completeOnboarding(result.sessionToken, { name: 'Yuta' }, database)
    database.$client.close()
    await use(result.sessionToken)
  },
  storageState: async ({ sessionToken }, use) => {
    await use({
      cookies: [
        {
          name: 'workspace_session',
          value: sessionToken,
          domain: '127.0.0.1',
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 3600,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    })
  },
  resetDecks: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixture arguments.
    async ({}, use) => {
      const path = process.env.TWITTER_LITE_E2E_DB_PATH
      if (
        !path ||
        !isAbsolute(path) ||
        !basename(dirname(path)).startsWith('twitter-lite-e2e-') ||
        basename(path) !== 'workspace.sqlite'
      )
        throw new Error('Isolated E2E database is required.')
      const database = openDatabase(path).$client
      database.pragma('foreign_keys = ON')
      database.exec('DELETE FROM decks; DELETE FROM legacy_imports;')
      database.close()
      await use(undefined)
    },
    { auto: true },
  ],
  a11y: async ({ page }, use) => {
    await use(() =>
      new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .disableRules(['meta-viewport']),
    )
  },
})

export { expect } from '@playwright/test'
