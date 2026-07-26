import { Base } from './Base'

export class UserPage extends Base {
  async goTo(handle: string) {
    await this.navigateTo(`/${handle}`)
  }

  async openPostDetails(postText: string) {
    await this.page
      .getByRole('article')
      .filter({ hasText: postText })
      .getByRole('link', { name: '詳細・スレッド' })
      .click()
  }
}
