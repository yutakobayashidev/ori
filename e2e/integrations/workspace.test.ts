import { expect, test } from '../fixtures'
import { closeMobileSidebar, showResearch } from '../workspace'

test('keeps the sidebar, composer and deck reachable at compact widths', async ({
  page,
  a11y,
}, testInfo) => {
  await page.goto('/deck')
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 850 })
    await showResearch(page)
    const chat = page.getByRole('complementary', { name: 'Research chat' })
    await expect(chat).toBeVisible()
    const composer = chat.getByRole('textbox', {
      name: 'Message',
      exact: true,
    })
    await expect(composer).toBeVisible()
    const bounds = await composer.boundingBox()
    if (!bounds) throw new Error('Composer must have a visible bounding box')
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(850)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    await page.screenshot({
      path: testInfo.outputPath(`workspace-${width}.png`),
    })
    if (width === 320) expect((await a11y().analyze()).violations).toEqual([])
    await closeMobileSidebar(page)
  }
  await page.getByRole('button', { name: 'Toggle sidebar' }).click()
  await expect(
    page.getByRole('complementary', { name: 'Research chat' }),
  ).toBeHidden()
  await page.getByRole('button', { name: 'Research chat', exact: true }).click()
  await expect(
    page.getByRole('complementary', { name: 'Research chat' }),
  ).toBeVisible()
})
