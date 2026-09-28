import { expect, type Page } from '@playwright/test'

export async function showDeckManagement(page: Page) {
  await expect(
    page.getByRole('button', { name: '名前を変更', includeHidden: true }),
  ).toBeEnabled()
  const navigation = page.getByRole('button', {
    name: 'デッキ管理',
    exact: true,
  })
  if (!(await navigation.isVisible())) {
    await page.getByRole('button', { name: 'サイドバーを切り替え' }).click()
  }
  await navigation.click()
}

export async function showResearch(page: Page) {
  await expect(
    page.getByRole('button', { name: '名前を変更', includeHidden: true }),
  ).toBeEnabled()
  const navigation = page.getByRole('button', {
    name: '調査チャット',
    exact: true,
  })
  if (!(await navigation.isVisible())) {
    await page.getByRole('button', { name: 'サイドバーを切り替え' }).click()
  }
  await navigation.click()
}

export async function closeMobileSidebar(page: Page) {
  const sheet = page.locator('[data-mobile="true"][data-sidebar="sidebar"]')
  if (await sheet.isVisible()) {
    await page
      .getByRole('button', { name: 'サイドバーを閉じる', exact: true })
      .click()
    await expect(sheet).toBeHidden()
  }
}
