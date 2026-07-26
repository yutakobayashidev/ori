import type { Locator, Page } from '@playwright/test'
import { Base } from './Base'

export class HomePage extends Base {
  readonly handleInputLocator: Locator
  readonly submitButtonLocator: Locator

  constructor(page: Page) {
    super(page)
    this.handleInputLocator = page.getByLabel('ハンドルまたはプロフィール URL')
    this.submitButtonLocator = page.getByRole('button', { name: '表示' })
  }

  async goTo() {
    await this.navigateTo('/')
  }

  async displayUser(handle: string) {
    await this.handleInputLocator.fill(handle)
    await this.submitButtonLocator.click()
  }
}
