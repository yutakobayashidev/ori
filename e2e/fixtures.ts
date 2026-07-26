import AxeBuilder from '@axe-core/playwright'
import { test as base } from '@playwright/test'
import { HomePage } from './models/HomePage'
import { ListsPage } from './models/ListsPage'
import { SearchPage } from './models/SearchPage'
import { ThreadPage } from './models/ThreadPage'
import { UserPage } from './models/UserPage'

type Fixtures = {
  a11y: () => AxeBuilder
  homePage: HomePage
  listsPage: ListsPage
  searchPage: SearchPage
  threadPage: ThreadPage
  userPage: UserPage
}

export const test = base.extend<Fixtures>({
  a11y: async ({ page }, use) => {
    const makeAxeBuilder = () =>
      new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .disableRules(['meta-viewport'])

    await use(makeAxeBuilder)
  },
  homePage: ({ page }, use) => use(new HomePage(page)),
  listsPage: ({ page }, use) => use(new ListsPage(page)),
  searchPage: ({ page }, use) => use(new SearchPage(page)),
  threadPage: ({ page }, use) => use(new ThreadPage(page)),
  userPage: ({ page }, use) => use(new UserPage(page)),
})

export { expect } from '@playwright/test'
