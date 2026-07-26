import { expect, test } from '../fixtures'

test('conversation has no accessibility violations', async ({
  a11y,
  threadPage,
}) => {
  await threadPage.goTo('yuta', '1001')
  await expect(threadPage.endOfFeedLocator).toBeVisible()

  const result = await a11y().analyze()
  expect(result.violations).toEqual([])
})
