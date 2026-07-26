import { expect, type Locator, type Page } from '@playwright/test'

export class Base {
  readonly ambientLinksLocator: Locator
  readonly articlesLocator: Locator
  readonly continuationErrorLocator: Locator
  readonly endOfFeedLocator: Locator
  readonly loadingRailLocator: Locator
  readonly mutationButtonsLocator: Locator
  readonly mutationLinksLocator: Locator

  constructor(readonly page: Page) {
    const ambientLinkNames = /ホーム|おすすめ|トレンド|通知|履歴/
    const mutationControlNames =
      /投稿する|返信|いいね|再投稿|フォロー|ブックマーク/

    this.ambientLinksLocator = page.getByRole('link', {
      name: ambientLinkNames,
    })
    this.articlesLocator = page.locator('article')
    this.continuationErrorLocator = page
      .getByRole('alert')
      .filter({ hasText: '続きの投稿を取得できませんでした。' })
    this.endOfFeedLocator = page.getByText('これ以上の投稿はありません。')
    this.loadingRailLocator = page.locator('.loading-rail')
    this.mutationButtonsLocator = page.getByRole('button', {
      name: mutationControlNames,
    })
    this.mutationLinksLocator = page.getByRole('link', {
      name: mutationControlNames,
    })
  }

  protected async navigateTo(path: string) {
    await this.page.goto(path)
    await this.page.waitForLoadState('networkidle')
  }

  async tabTo(target: Locator) {
    await this.page.keyboard.press('Tab')
    await expect(target).toBeFocused()
  }

  async retryContinuation() {
    await this.continuationErrorLocator
      .getByRole('button', { name: '再試行' })
      .click()
  }
}
