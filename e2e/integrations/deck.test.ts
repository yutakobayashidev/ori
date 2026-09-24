import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'

async function addColumn(
  page: Page,
  title: string,
  query: string,
  profile = 'e2e',
  kind = 'search',
) {
  await page.getByRole('button', { name: 'カラムを追加', exact: true }).click()
  const editor = page.getByRole('form', { name: 'カラムを追加', exact: true })
  await editor.getByLabel('カラム名', { exact: true }).fill(title)
  await editor
    .getByRole('combobox', { name: '接続プロファイル', exact: true })
    .selectOption({ label: profile })
  await editor
    .getByRole('combobox', { name: 'カラムの種類', exact: true })
    .selectOption(kind)
  await editor
    .getByLabel(
      kind === 'search'
        ? 'Twitterの検索条件'
        : kind === 'user'
          ? 'ユーザー'
          : 'リスト',
      { exact: true },
    )
    .fill(query)
  await editor.getByRole('button', { name: '追加して検索' }).click()
  await expect(
    page
      .getByRole('region', { name: title, exact: true })
      .locator('article')
      .first(),
  ).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'デッキとして保存', exact: true }),
  ).toBeEnabled()
  await page
    .getByRole('button', { name: 'デッキとして保存', exact: true })
    .click()
  await expect(page.getByText('サーバーに保存・端末間で共有')).toHaveCount(1)
})

test('binds identical searches to independent profiles through paging, editing and reload', async ({
  page,
}) => {
  await addColumn(page, '通常の接続', 'same-query')
  await addColumn(page, '別の接続', 'same-query', 'alternate')
  const first = page.getByRole('region', { name: '通常の接続', exact: true })
  const second = page.getByRole('region', { name: '別の接続', exact: true })
  await expect(
    first.getByText('Latest · all page 1', { exact: true }),
  ).toBeVisible()
  await expect(
    second.getByText('alternate · Latest · all page 1', { exact: true }),
  ).toBeVisible()
  await first.getByRole('button', { name: '続きを読み込む' }).click()
  await expect(first.locator('article')).toHaveCount(2)
  await expect(second.locator('article')).toHaveCount(1)
  await second.getByRole('button', { name: '続きを読み込む' }).click()
  await expect(
    second.getByText('alternate · Latest · all page 2'),
  ).toBeVisible()
  await second.locator('summary[aria-label="別の接続の操作"]').click()
  await second.getByRole('button', { name: '編集', exact: true }).click()
  await page
    .getByRole('combobox', { name: '接続プロファイル', exact: true })
    .selectOption({ label: 'e2e' })
  await page.getByRole('button', { name: '変更を保存' }).click()
  await expect(
    second.getByText('Latest · all page 1', { exact: true }),
  ).toBeVisible()
  await expect(second.getByText('alternate · Latest · all page 1')).toHaveCount(
    0,
  )
  await page.reload()
  await expect(
    second.getByText('Latest · all page 1', { exact: true }),
  ).toBeVisible()
  await expect(first.locator('article')).toHaveCount(1)
})

test('creates, switches, renames and deletes persisted deck profiles', async ({
  page,
}) => {
  await page.getByRole('button', { name: '名前を変更' }).click()
  await page.getByLabel('調査テーマ・デッキ名').fill('最初の調査')
  await page.getByRole('button', { name: '名前を保存' }).click()
  await addColumn(page, '最初の観点', 'first-deck')
  await page.getByRole('button', { name: 'デッキを作成', exact: true }).click()
  await page.getByLabel('新しいデッキ名').fill('別の調査')
  await page.getByRole('button', { name: '作成', exact: true }).click()
  await expect(page.locator('.deck-column')).toHaveCount(0)
  await addColumn(page, '別の観点', 'second-deck', 'alternate')
  await page
    .getByLabel('デッキプロファイル', { exact: true })
    .selectOption({ label: '最初の調査' })
  await expect(page.locator('.deck-column h2')).toHaveText(['最初の観点'])
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('最初の調査')
  await page
    .getByLabel('デッキプロファイル', { exact: true })
    .selectOption({ label: '別の調査' })
  await expect(page.locator('.deck-column h2')).toHaveText(['別の観点'])
  await page.getByRole('button', { name: 'デッキを削除', exact: true }).click()
  await page.getByRole('button', { name: '削除する', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('最初の調査')
  await expect(
    page.getByLabel('デッキプロファイル', { exact: true }).locator('option'),
  ).toHaveCount(1)
})

test('reads user and list timelines within columns and reorders, deletes and restores them', async ({
  page,
}) => {
  await addColumn(page, 'アカウント', 'yuta', 'alternate', 'user')
  await addColumn(page, 'リストの投稿', '1234567890', 'e2e', 'list')
  const user = page.getByRole('region', { name: 'アカウント', exact: true })
  const list = page.getByRole('region', { name: 'リストの投稿', exact: true })
  await expect(user.getByText('alternate profile page 1')).toBeVisible()
  await expect(list.getByText('list page 1')).toBeVisible()
  await list.getByRole('button', { name: '続きを読み込む' }).click()
  await expect(list.getByText('list page 2')).toBeVisible()
  await list.locator('summary[aria-label="リストの投稿の操作"]').click()
  await list.getByRole('button', { name: 'リストの投稿を左へ' }).click()
  await expect(page.locator('.deck-column h2')).toHaveText([
    'リストの投稿',
    'アカウント',
  ])
  await list.locator('summary[aria-label="リストの投稿の操作"]').click()
  await list.getByRole('button', { name: 'リストの投稿を削除' }).click()
  await page.getByRole('button', { name: '元に戻す' }).click()
  await expect(page.locator('.deck-column h2')).toHaveText([
    'リストの投稿',
    'アカウント',
  ])
  await page.reload()
  await expect(user.getByText('alternate profile page 1')).toBeVisible()
  await expect(list.getByText('list page 1')).toBeVisible()
})

test('keeps other columns usable when pagination fails and retries that column', async ({
  page,
}, testInfo) => {
  await addColumn(page, '失敗する検索', `retry-deck-${testInfo.project.name}`)
  await addColumn(page, '別の検索', 'independent-deck')
  const failed = page.getByRole('region', { name: '失敗する検索', exact: true })
  const other = page.getByRole('region', { name: '別の検索', exact: true })
  await failed.getByRole('button', { name: '続きを読み込む' }).click()
  await expect(failed.getByRole('alert')).toBeVisible()
  await expect(failed.locator('article')).toHaveCount(1)
  await other.getByRole('button', { name: '続きを読み込む' }).click()
  await expect(other.locator('article')).toHaveCount(2)
  await failed.getByRole('button', { name: '再試行' }).click()
  await expect(failed.locator('article')).toHaveCount(2)
})

test('keeps the deck and editor accessible within narrow viewports', async ({
  page,
  a11y,
}, testInfo) => {
  await addColumn(page, '日本語の反応', 'WebMCP lang:ja')
  await addColumn(page, '海外の反応', 'WebMCP lang:en', 'alternate')
  await addColumn(page, '公式アカウント', 'OpenAI', 'e2e', 'user')
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true)
    const board = await page.locator('.deck-board').boundingBox()
    expect(board).not.toBeNull()
    expect((board?.y ?? 0) + (board?.height ?? 0)).toBeLessThanOrEqual(901)
  }
  await page.setViewportSize({
    width: testInfo.project.name === 'desktop' ? 1440 : 393,
    height: 900,
  })
  if (testInfo.project.name === 'desktop') {
    await page
      .getByRole('navigation', { name: 'カラム一覧' })
      .getByRole('button', { name: '公式アカウント' })
      .click()
    await expect(
      page
        .getByRole('region', { name: '公式アカウント', exact: true })
        .locator('.deck-column-results'),
    ).toBeFocused()
  }
  expect((await a11y().analyze()).violations).toEqual([])
  await page.screenshot({
    path: testInfo.outputPath('deck-populated.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'カラムを追加', exact: true }).click()
  expect((await a11y().analyze()).violations).toEqual([])
  await page.screenshot({
    path: testInfo.outputPath('deck.png'),
    fullPage: true,
  })
})

test('closes the column editor with Escape and restores focus without applying edits', async ({
  page,
}) => {
  const opener = page.getByRole('button', { name: 'カラムを追加', exact: true })
  await opener.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByLabel('カラム名', { exact: true }).fill('キャンセルする観点')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(opener).toBeFocused()
  await expect(page.locator('.deck-column')).toHaveCount(0)
  await opener.click()
  await expect(page.getByLabel('カラム名', { exact: true })).toHaveValue('')
})

test('does not overwrite unreadable storage on reload', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem('twitter-lite-research-deck', '{broken'),
  )
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('読み込めませんでした')
  expect(
    await page.evaluate(() =>
      localStorage.getItem('twitter-lite-research-deck'),
    ),
  ).toBe('{broken')
})

test('selects a list from the column profile catalog and refreshes it on profile change', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'カラムを追加', exact: true }).click()
  await page.getByLabel('カラム名', { exact: true }).fill('購読リスト')
  await page
    .getByRole('combobox', { name: '接続プロファイル', exact: true })
    .selectOption({ label: 'e2e' })
  await page
    .getByRole('combobox', { name: 'カラムの種類', exact: true })
    .selectOption('list')
  await expect(
    page.getByRole('button', { name: 'My E2E List', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('combobox', { name: '接続プロファイル', exact: true })
    .selectOption({ label: 'alternate' })
  await expect(
    page.getByRole('button', { name: 'My E2E List', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Alternate List', exact: true })
    .click()
  await expect(page.getByLabel('リスト', { exact: true })).toHaveValue(
    '1234567890',
  )
  await page.getByRole('button', { name: '追加して検索' }).click()
  await expect(
    page
      .getByRole('region', { name: '購読リスト', exact: true })
      .getByText('list page 1', { exact: true }),
  ).toBeVisible()
})

test('keeps an open draft through remote edits and rejects its stale save', async ({
  page,
  browser,
  baseURL,
}) => {
  const other = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { 'Tailscale-User-Login': 'owner@twitter-lite.invalid' },
  })
  try {
    const device = await other.newPage()
    await device.goto('/')
    await page.getByRole('button', { name: '名前を変更' }).click()
    await page.getByLabel('調査テーマ・デッキ名').fill('編集中の名前')
    await device.getByRole('button', { name: '名前を変更' }).click()
    await device.getByLabel('調査テーマ・デッキ名').fill('別の端末の変更')
    await device.getByRole('button', { name: '名前を保存' }).click()
    await expect(device.getByRole('heading', { level: 1 })).toHaveText(
      '別の端末の変更',
    )
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByLabel('調査テーマ・デッキ名')).toHaveValue(
      '編集中の名前',
    )
    await page.getByRole('button', { name: '名前を保存' }).click()
    await expect(page.getByRole('alert')).toContainText(
      '別の端末で変更されました',
    )
    await expect(page.getByLabel('調査テーマ・デッキ名')).toHaveValue(
      '編集中の名前',
    )
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '最新のデッキを再読み込み' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      '別の端末の変更',
    )
  } finally {
    await other.close()
  }
})

test('imports old browser decks explicitly and avoids duplicate imports after retry', async ({
  page,
}) => {
  const legacy = {
    version: 2,
    activeDeckId: 'old',
    decks: [
      {
        id: 'old',
        title: '以前の調査',
        columns: [
          {
            id: 'a',
            title: '以前の観点',
            profileName: 'e2e',
            source: {
              platform: 'twitter',
              kind: 'search',
              query: 'WebMCP',
              product: 'Latest',
              following: false,
            },
          },
        ],
      },
    ],
  }
  await page.evaluate(
    (legacy) =>
      localStorage.setItem(
        'twitter-lite-research-deck',
        JSON.stringify(legacy),
      ),
    legacy,
  )
  await page.reload()
  const selector = page.getByLabel('デッキプロファイル', { exact: true })
  await expect(selector.locator('option')).toHaveCount(1)
  await page.getByRole('button', { name: '旧デッキを取り込む' }).click()
  await expect(selector.locator('option')).toHaveCount(2)
  await selector.selectOption({ label: '以前の調査' })
  await expect(
    page.getByText('Latest · all page 1', { exact: true }),
  ).toBeVisible()
  await page.evaluate(
    (legacy) =>
      localStorage.setItem(
        'twitter-lite-research-deck',
        JSON.stringify(legacy),
      ),
    legacy,
  )
  await page.reload()
  await page.getByRole('button', { name: '旧デッキを取り込む' }).click()
  await expect(
    page.getByRole('button', { name: '旧デッキを取り込む' }),
  ).toHaveCount(0)
  await expect(selector.locator('option')).toHaveCount(2)
})
