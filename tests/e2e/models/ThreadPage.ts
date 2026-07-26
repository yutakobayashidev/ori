import type { Locator, Page } from '@playwright/test'
import { Base } from './Base'

export class ThreadPage extends Base {
  readonly headingLocator: Locator
  readonly selectedPostLabelLocator: Locator

  constructor(page: Page) {
    super(page)
    this.headingLocator = page.getByRole('heading', { name: '会話' })
    this.selectedPostLabelLocator = page.getByText('表示中の投稿')
  }

  async goTo(handle: string, tweetId: string) {
    await this.navigateTo(`/${handle}/status/${tweetId}`)
  }
}
