import { expect, test } from '../fixtures'

test('home page has no accessibility violations', async ({
  a11y,
  homePage,
}) => {
  await homePage.goTo()
  await expect(homePage.articlesLocator).toHaveCount(0)

  const result = await a11y().analyze()
  expect(result.violations).toEqual([])
})
