import { Base } from './Base'

export class ListsPage extends Base {
  async goTo() {
    await this.navigateTo('/i/lists')
  }

  async openList(name: RegExp | string) {
    await this.page.getByRole('link', { name }).click()
  }
}
