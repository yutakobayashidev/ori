import { expect, test } from '../fixtures'

test('user timeline has no accessibility violations', async ({
  a11y,
  userPage,
}) => {
  await userPage.goTo('yuta')
  await expect(userPage.endOfFeedLocator).toBeVisible()

  const result = await a11y().analyze()
  expect(result.violations).toEqual([])
})
