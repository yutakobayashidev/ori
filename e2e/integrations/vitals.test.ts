import { expect, test } from '../fixtures'

test('filters body systems and opens lab history', async ({ page, a11y }) => {
  await page.goto('/vitals')
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByRole('heading', { name: 'Body', exact: true }),
  ).toBeVisible()
  const systems = page.locator('.vital-system-card')
  await expect(systems).toHaveCount(8)
  await page
    .locator('.vital-body-page > .vital-tabs')
    .getByRole('button', { name: 'Cardiovascular', exact: true })
    .click()
  await expect(systems).toHaveCount(1)
  await systems.first().click()
  const dialog = page.getByRole('dialog', { name: 'Cardiovascular' })
  await expect(dialog).toContainText('68')
  await dialog
    .getByRole('button', { name: '閉じる', exact: true })
    .last()
    .click()
  await page.getByRole('button', { name: 'Lab history', exact: true }).click()
  await expect(page.locator('.vital-history')).toContainText('Jul 28')
  await expect(page.locator('.vital-history')).toContainText('93')
  await page.getByRole('button', { name: 'Systems', exact: true }).click()
  await page
    .locator('.vital-body-page > .vital-tabs')
    .getByRole('button', { name: 'Overview', exact: true })
    .click()
  await expect(systems).toHaveCount(8)
  expect((await a11y().analyze()).violations).toEqual([])
})

test('explores environment charts and simulated climate controls', async ({
  page,
  a11y,
}) => {
  await page.goto('/vitals')
  await page.waitForLoadState('networkidle')
  const menu = page.getByRole('button', { name: 'Healthメニューを開く' })
  if (await menu.isVisible()) await menu.click()
  await page
    .getByRole('complementary', { name: 'Health navigation' })
    .getByRole('button', { name: 'Environment', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Environment', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '7D', exact: true }).click()
  await page
    .getByRole('group', { name: 'Trend metric' })
    .getByRole('button', { name: 'CO₂', exact: true })
    .click()
  await expect(
    page.getByRole('img', { name: '7D CO₂ simulated environmental readings' }),
  ).toBeVisible()
  await page
    .locator('.vital-metric')
    .filter({ hasText: 'Room temperature' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Room temperature' })
  await expect(dialog).toContainText('64.0')
  await dialog.getByRole('button', { name: 'Back to overview' }).click()
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Sample readings refreshed' }),
  ).toBeVisible()
  expect((await a11y().analyze()).violations).toEqual([])
  await page
    .getByRole('button', { name: 'Climate control', exact: true })
    .click()
  await page.getByRole('button', { name: 'Cool', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Cool', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  const temperature = page.getByRole('slider', { name: 'Target temperature' })
  await temperature.focus()
  await temperature.press('ArrowRight')
  await expect(temperature).toHaveValue('69')
  await page.getByRole('button', { name: 'Air purifier · On' }).click()
  await expect(
    page.getByRole('button', { name: 'Air purifier · Off' }),
  ).toHaveAttribute('aria-pressed', 'false')
})

test('keeps both dashboards within the viewport', async ({
  page,
}, testInfo) => {
  await page.goto('/vitals')
  await page.waitForLoadState('networkidle')
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    await page.screenshot({ path: testInfo.outputPath(`body-${width}.png`) })
    const menu = page.getByRole('button', { name: 'Healthメニューを開く' })
    if (await menu.isVisible()) await menu.click()
    const navigation = page.getByRole('complementary', {
      name: 'Health navigation',
    })
    await navigation
      .getByRole('button', { name: 'Environment', exact: true })
      .click()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    await page.screenshot({
      path: testInfo.outputPath(`environment-${width}.png`),
    })
    if (await menu.isVisible()) await menu.click()
    await navigation.getByRole('button', { name: 'Body', exact: true }).click()
  }
})
