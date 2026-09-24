import { basename, dirname, isAbsolute } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { test as base } from '@playwright/test'
import { openDatabase } from '../src/features/storage/database.server'

export const test = base.extend<{
  a11y: () => AxeBuilder
  resetDecks: undefined
}>({
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
