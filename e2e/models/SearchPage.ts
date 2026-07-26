import type { Locator, Page } from '@playwright/test'
import { Base } from './Base'

export class SearchPage extends Base {
  readonly followingOnlyLocator: Locator
  readonly latestRankingLocator: Locator
  readonly queryInputLocator: Locator
  readonly searchButtonLocator: Locator
  readonly topRankingLocator: Locator

  constructor(page: Page) {
    super(page)
    this.followingOnlyLocator = page.getByLabel('フォロー中のみ')
    this.latestRankingLocator = page.getByLabel('最新順')
    this.queryInputLocator = page.getByLabel('検索語')
    this.searchButtonLocator = page.getByRole('button', { name: '検索' })
    this.topRankingLocator = page.getByLabel('人気順')
  }

  async goTo() {
    await this.navigateTo('/search?q=&product=Latest&following=false')
  }

  async search(query: string) {
    await this.queryInputLocator.fill(query)
    await this.searchButtonLocator.click()
  }

  async searchTopFromFollowing(query: string) {
    await this.queryInputLocator.fill(query)
    await this.topRankingLocator.check()
    await this.followingOnlyLocator.check()
    await this.searchButtonLocator.click()
  }
}
