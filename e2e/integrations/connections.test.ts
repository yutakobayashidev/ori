import { expect, test } from '../fixtures'
import { showDeckManagement } from '../workspace'

test('opens account management after hydration without inheriting real OAuth configuration', async ({
  page,
}) => {
  await page.goto('/')
  await showDeckManagement(page)
  const manage = page.getByRole('button', { name: '接続アカウントを管理' })
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

test('rejects an unbound OAuth callback without contacting an instance', async ({
  page,
}) => {
  await page.goto('/oauth/mastodon/callback?state=invalid&code=not-a-real-code')
  await expect(page).toHaveURL(/\/\?mastodon=failed$/)
  await expect(page.getByRole('alert')).toContainText(
    'Mastodonの認可を完了できませんでした。',
  )
  await showDeckManagement(page)
  await expect(
    page.getByRole('button', { name: '接続アカウントを管理' }),
  ).toBeEnabled()
})
