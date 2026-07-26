import { expect, test } from '../fixtures'

test('empty search page has no accessibility violations', async ({
  a11y,
  searchPage,
}) => {
  await searchPage.goTo()
  await expect(searchPage.articlesLocator).toHaveCount(0)

  const result = await a11y().analyze()
  expect(result.violations).toEqual([])
})

test('search results have no accessibility violations', async ({
  a11y,
  searchPage,
}) => {
  await searchPage.goTo()
  await searchPage.search('AI lang:ja')
  await expect(searchPage.endOfFeedLocator).toBeVisible()

  const result = await a11y().analyze()
  expect(result.violations).toEqual([])
})
