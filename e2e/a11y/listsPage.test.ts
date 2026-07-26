import { expect, test } from '../fixtures'

test('list picker has no accessibility violations', async ({
  a11y,
  listsPage,
}) => {
  await listsPage.goTo()
  await expect(listsPage.articlesLocator).toHaveCount(0)

  const result = await a11y().analyze()
  expect(result.violations).toEqual([])
})

test('list timeline has no accessibility violations', async ({
  a11y,
  listsPage,
}) => {
  await listsPage.goTo()
  await listsPage.openList(/My E2E List.*10 メンバー/)
  await expect(listsPage.endOfFeedLocator).toBeVisible()

  const result = await a11y().analyze()
  expect(result.violations).toEqual([])
})
