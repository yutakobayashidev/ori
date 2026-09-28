import { expect, test } from '../fixtures'

test('opens account management after hydration without inheriting real OAuth configuration', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: '名前を変更', includeHidden: true }),
  ).toBeEnabled()
  const manage = page.getByRole('button', { name: '接続アカウントを管理' })
  if (!(await manage.isVisible())) {
    await page.getByRole('button', { name: 'サイドバーを切り替え' }).click()
  }
  await expect(manage).toBeEnabled()
  await manage.click()
  const dialog = page.getByRole('dialog', { name: '接続アカウント' })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByText('利用するMastodonサーバーがまだ設定されていません。'),
  ).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Mastodonで認可する' }),
  ).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(manage).toBeFocused()
})

test('opens account management from the inbox footer and restores focus on close', async ({
  page,
  a11y,
}) => {
  await page.goto('/inbox')
  await page.waitForLoadState('networkidle')
  const manage = page.getByRole('button', { name: '接続アカウントを管理' })
  await expect(manage).toBeVisible()
  await manage.click()
  const dialog = page.getByRole('dialog', { name: '接続アカウント' })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByText('利用するMastodonサーバーがまだ設定されていません。'),
  ).toBeVisible()
  expect((await a11y().analyze()).violations).toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(manage).toBeFocused()
  await expect(page.getByRole('textbox', { name: '記事を検索' })).toBeVisible()
})

test('rejects an unbound OAuth callback without contacting an instance', async ({
  page,
}) => {
  await page.goto('/oauth/mastodon/callback?state=invalid&code=not-a-real-code')
  await expect(page).toHaveURL(/\/\?mastodon=failed$/)
  await expect(page.getByRole('alert')).toContainText(
    'Mastodonの認可を完了できませんでした。',
  )
  await expect(
    page.getByRole('button', { name: '名前を変更', includeHidden: true }),
  ).toBeEnabled()
  const manage = page.getByRole('button', { name: '接続アカウントを管理' })
  if (!(await manage.isVisible())) {
    await page.getByRole('button', { name: 'サイドバーを切り替え' }).click()
  }
  await expect(
    page.getByRole('button', { name: '接続アカウントを管理' }),
  ).toBeEnabled()
})
