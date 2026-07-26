import { test as base } from '@playwright/test'
import { HomePage } from './models/HomePage'
import { ListsPage } from './models/ListsPage'
import { SearchPage } from './models/SearchPage'
import { ThreadPage } from './models/ThreadPage'
import { UserPage } from './models/UserPage'

type Fixtures = {
  homePage: HomePage
  listsPage: ListsPage
  searchPage: SearchPage
  threadPage: ThreadPage
  userPage: UserPage
}

export const test = base.extend<Fixtures>({
  homePage: ({ page }, use) => use(new HomePage(page)),
  listsPage: ({ page }, use) => use(new ListsPage(page)),
  searchPage: ({ page }, use) => use(new SearchPage(page)),
  threadPage: ({ page }, use) => use(new ThreadPage(page)),
  userPage: ({ page }, use) => use(new UserPage(page)),
})

export { expect } from '@playwright/test'
