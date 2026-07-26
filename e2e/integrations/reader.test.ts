import { expect, test } from '../fixtures'

let consoleErrors: string[]
let pageErrors: string[]

test.beforeEach(async ({ page }) => {
  consoleErrors = []
  pageErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
})

test.afterEach(() => {
  expect(consoleErrors, 'browser console errors').toEqual([])
  expect(pageErrors, 'uncaught browser errors').toEqual([])
})

test('requires intent and infinitely loads a user timeline', async ({
  homePage,
  page,
  userPage,
}) => {
  await homePage.goTo()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
    'content',
    'no-referrer',
  )
  await expect(homePage.articlesLocator).toHaveCount(0)
  await expect(homePage.ambientLinksLocator).toHaveCount(0)

  await homePage.displayUser('@yuta')

  await expect(page).toHaveURL(/\/yuta$/)
  await expect(page.getByText('user page 1')).toBeVisible()
  await expect(page.getByText('user page 2')).toBeVisible()
  await expect(userPage.endOfFeedLocator).toBeVisible()
  await expect(page).toHaveScreenshot('mist-user.png', {
    animations: 'disabled',
    fullPage: true,
  })
})

test('selects an authenticated list and infinitely loads its timeline', async ({
  listsPage,
  page,
}) => {
  await listsPage.goTo()
  await expect(listsPage.articlesLocator).toHaveCount(0)

  await listsPage.openList(/My E2E List.*10 メンバー/)

  await expect(page).toHaveURL(/\/i\/lists\/1234567890$/)
  await expect(page.getByText('list page 1')).toBeVisible()
  await expect(page.getByText('list page 2')).toBeVisible()
  await expect(listsPage.endOfFeedLocator).toBeVisible()
})

test('opens a card detail and infinitely loads its conversation', async ({
  page,
  threadPage,
  userPage,
}) => {
  await userPage.goTo('yuta')
  await userPage.openPostDetails('user page 1')

  await expect(page).toHaveURL(/\/yuta\/status\/1001$/)
  await expect(threadPage.headingLocator).toBeVisible()
  await expect(threadPage.selectedPostLabelLocator).toBeVisible()
  await expect(page.getByText('user page 1')).toHaveCount(1)
  await expect(page.getByText('thread root')).toBeVisible()
  await expect(page.getByText('thread page 1')).toBeVisible()
  await expect(page.getByText('thread page 2')).toBeVisible()
  await expect(threadPage.endOfFeedLocator).toBeVisible()
  await expect(page).toHaveScreenshot('mist-thread.png', {
    animations: 'disabled',
    fullPage: true,
  })
})

test('resolves a reply root and retries only the failed continuation', async ({
  page,
  threadPage,
}) => {
  await threadPage.goTo('yuta', '2001')

  await expect(page.getByText('retry focal')).toHaveCount(1)
  await expect(page.getByText('thread root')).toBeVisible()
  await expect(page.getByText('thread page 1')).toBeVisible()
  await expect(threadPage.continuationErrorLocator).toHaveCount(1)
  await expect(page.getByText('retry focal')).toHaveCount(1)

  await threadPage.retryContinuation()

  await expect(page.getByText('thread page 2')).toBeVisible()
  await expect(threadPage.continuationErrorLocator).toHaveCount(0)
  await expect(threadPage.endOfFeedLocator).toBeVisible()
  await expect(threadPage.mutationButtonsLocator).toHaveCount(0)
})

test('ends a thread without loading a continuation when there are no replies', async ({
  page,
  threadPage,
}) => {
  await threadPage.goTo('yuta', '3001')

  await expect(page.getByText('no replies')).toHaveCount(1)
  await expect(page.getByText('thread root')).toBeVisible()
  await expect(threadPage.endOfFeedLocator).toBeVisible()
  await expect(threadPage.continuationErrorLocator).toHaveCount(0)
})

test('searches Top posts from followed accounts', async ({
  page,
  searchPage,
}) => {
  await searchPage.goTo()
  await expect(searchPage.articlesLocator).toHaveCount(0)
  await searchPage.searchTopFromFollowing('AI lang:ja')
  await expect(searchPage.followingOnlyLocator).toBeChecked()

  await expect(page).toHaveURL(/following=true/)
  await expect(page.getByText('Top · follows page 1')).toBeVisible()
  await expect(page.getByText('Top · follows page 2')).toBeVisible()
  await expect(searchPage.endOfFeedLocator).toBeVisible()
})

test('retains the first page through a pagination error and retries explicitly', async ({
  page,
  searchPage,
}, testInfo) => {
  await searchPage.goTo()
  await expect(searchPage.articlesLocator).toHaveCount(0)
  await searchPage.search(`retry-${testInfo.project.name}`)

  await expect(page.getByText('Latest · all page 1')).toBeVisible()
  await expect(searchPage.continuationErrorLocator).toHaveCount(1)
  await expect(page.getByText('Latest · all page 1')).toBeVisible()
  await expect(page.getByText('Latest · all page 2')).toHaveCount(0)

  await searchPage.retryContinuation()

  await expect(page.getByText('Latest · all page 2')).toBeVisible()
  await expect(searchPage.continuationErrorLocator).toHaveCount(0)
  await expect(searchPage.endOfFeedLocator).toBeVisible()
})

test('keeps keyboard focus intentional and discovery or mutation controls absent', async ({
  searchPage,
}) => {
  await searchPage.goTo()

  await searchPage.tabTo(
    searchPage.page.getByRole('link', { name: 'ユーザー' }),
  )
  await searchPage.tabTo(searchPage.page.getByRole('link', { name: '検索' }))
  await searchPage.tabTo(searchPage.page.getByRole('link', { name: 'リスト' }))
  await searchPage.tabTo(searchPage.queryInputLocator)
  await expect(searchPage.latestRankingLocator).toBeChecked()
  await searchPage.tabTo(searchPage.latestRankingLocator)
  await searchPage.tabTo(searchPage.followingOnlyLocator)
  await searchPage.tabTo(searchPage.searchButtonLocator)

  await expect(searchPage.ambientLinksLocator).toHaveCount(0)
  await expect(searchPage.mutationButtonsLocator).toHaveCount(0)
  await expect(searchPage.mutationLinksLocator).toHaveCount(0)
})

test('removes loading rail animation for reduced motion', async ({
  page,
  searchPage,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await searchPage.goTo()
  await expect(searchPage.articlesLocator).toHaveCount(0)
  await searchPage.search(`slow-${testInfo.project.name}`)

  const rail = searchPage.loadingRailLocator
  await expect(rail).toBeVisible()
  await expect
    .poll(() =>
      rail.evaluate((element) =>
        getComputedStyle(element, '::after').getPropertyValue('animation-name'),
      ),
    )
    .toBe('none')

  await expect(page.getByText('Latest · all page 2')).toBeVisible()
  await expect(searchPage.endOfFeedLocator).toBeVisible()
})
