import { expect, type Locator, test } from '@playwright/test'

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

const ambientLinkNames = /ホーム|おすすめ|トレンド|通知|履歴/
const mutationControlNames = /投稿する|返信|いいね|再投稿|フォロー|ブックマーク/

async function submitSearch(
  page: import('@playwright/test').Page,
  query: string,
) {
  await openReader(page, '/search?q=&product=Latest&following=false')
  await expect(page.locator('article')).toHaveCount(0)
  await page.getByLabel('検索語').fill(query)
  await page.getByRole('button', { name: '検索' }).click()
}

async function openReader(page: import('@playwright/test').Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
}

async function tabTo(page: import('@playwright/test').Page, target: Locator) {
  await page.keyboard.press('Tab')
  await expect(target).toBeFocused()
}

test('requires intent and infinitely loads a user timeline', async ({
  page,
}) => {
  await openReader(page, '/')
  await expect(page).toHaveURL(/\/user\?target=$/)
  await expect(page.locator('article')).toHaveCount(0)
  await expect(page.getByRole('link', { name: ambientLinkNames })).toHaveCount(
    0,
  )

  await page.getByLabel('ハンドルまたはプロフィール URL').fill('@yuta')
  await page.getByRole('button', { name: '表示' }).click()

  await expect(page.getByText('user page 1')).toBeVisible()
  await expect(page.getByText('user page 2')).toBeVisible()
  await expect(page.getByText('これ以上の投稿はありません。')).toBeVisible()
  await expect(page).toHaveScreenshot('mist-user.png', {
    animations: 'disabled',
    fullPage: true,
  })
})

test('searches Top posts from followed accounts', async ({ page }) => {
  await openReader(page, '/search?q=&product=Latest&following=false')
  await expect(page.locator('article')).toHaveCount(0)
  await page.getByLabel('検索語').fill('AI lang:ja')
  await page.getByLabel('人気順').check()
  await page.getByLabel('フォロー中のみ').check()
  await expect(page.getByLabel('フォロー中のみ')).toBeChecked()
  await page.getByRole('button', { name: '検索' }).click()

  await expect(page).toHaveURL(/following=true/)
  await expect(page.getByText('Top · follows page 1')).toBeVisible()
  await expect(page.getByText('Top · follows page 2')).toBeVisible()
  await expect(page.getByText('これ以上の投稿はありません。')).toBeVisible()
})

test('retains the first page through a pagination error and retries explicitly', async ({
  page,
}, testInfo) => {
  await submitSearch(page, `retry-${testInfo.project.name}`)

  await expect(page.getByText('Latest · all page 1')).toBeVisible()
  const laterPageAlert = page
    .getByRole('alert')
    .filter({ hasText: '続きの投稿を取得できませんでした。' })
  await expect(laterPageAlert).toHaveCount(1)
  await expect(page.getByText('Latest · all page 1')).toBeVisible()
  await expect(page.getByText('Latest · all page 2')).toHaveCount(0)

  await laterPageAlert.getByRole('button', { name: '再試行' }).click()

  await expect(page.getByText('Latest · all page 2')).toBeVisible()
  await expect(laterPageAlert).toHaveCount(0)
  await expect(page.getByText('これ以上の投稿はありません。')).toBeVisible()
})

test('keeps keyboard focus intentional and discovery or mutation controls absent', async ({
  page,
}) => {
  await openReader(page, '/search?q=&product=Latest&following=false')

  await tabTo(page, page.getByRole('link', { name: 'ユーザー' }))
  await tabTo(page, page.getByRole('link', { name: '検索' }))
  await tabTo(page, page.getByLabel('検索語'))
  const ranking = page.getByLabel('最新順')
  await expect(ranking).toBeChecked()
  await tabTo(page, ranking)
  await tabTo(page, page.getByLabel('フォロー中のみ'))
  await tabTo(page, page.getByRole('button', { name: '検索' }))

  await expect(page.getByRole('link', { name: ambientLinkNames })).toHaveCount(
    0,
  )
  await expect(
    page.getByRole('button', { name: mutationControlNames }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: mutationControlNames }),
  ).toHaveCount(0)
})

test('removes loading rail animation for reduced motion', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await submitSearch(page, `slow-${testInfo.project.name}`)

  const rail = page.locator('.loading-rail')
  await expect(rail).toBeVisible()
  await expect
    .poll(() =>
      rail.evaluate((element) =>
        getComputedStyle(element, '::after').getPropertyValue('animation-name'),
      ),
    )
    .toBe('none')

  await expect(page.getByText('Latest · all page 2')).toBeVisible()
  await expect(page.getByText('これ以上の投稿はありません。')).toBeVisible()
})
