import { expect, type Page } from '@playwright/test'

export async function showDeckManagement(page: Page) {
  await expect(
    page.getByRole('button', { name: 'Rename', includeHidden: true }),
  ).toBeEnabled()
  const navigation = page.getByRole('button', {
    name: 'Deck manager',
    exact: true,
  })
  if (!(await navigation.isVisible())) {
    await page.getByRole('button', { name: 'Toggle sidebar' }).click()
  }
  await navigation.click()
}

export async function showResearch(page: Page) {
  await expect(
    page.getByRole('button', { name: 'Rename', includeHidden: true }),
  ).toBeEnabled()
  const navigation = page.getByRole('button', {
    name: 'Research chat',
    exact: true,
  })
  if (!(await navigation.isVisible())) {
    await page.getByRole('button', { name: 'Toggle sidebar' }).click()
  }
  await navigation.click()
}

export async function closeMobileSidebar(page: Page) {
  const sheet = page.locator('[data-mobile="true"][data-sidebar="sidebar"]')
  if (await sheet.isVisible()) {
    await page
      .getByRole('button', { name: 'Close sidebar', exact: true })
      .click()
    await expect(sheet).toBeHidden()
  }
}
