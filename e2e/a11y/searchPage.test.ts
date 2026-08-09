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

test('open filters and active condition chips have no accessibility violations', async ({
  a11y,
  page,
  searchPage,
}) => {
  await searchPage.goTo()
  await searchPage.queryInputLocator.fill('TypeScript')
  await page.getByRole('button', { name: '投稿者' }).click()
  await page.getByLabel('投稿者').fill('@tan_stack')
  await page.getByRole('button', { name: '言語' }).click()
  await page.getByLabel('日本語').check()
  await expect(
    page.getByRole('button', { name: '投稿者 @tan_stack を解除' }),
  ).toBeVisible()

  const result = await a11y().analyze()
  expect(result.violations).toEqual([])
})
