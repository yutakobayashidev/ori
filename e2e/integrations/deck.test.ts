import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'

async function addColumn(
  page: Page,
  title: string,
  query: string,
  top = false,
) {
  await page.getByRole('button', { name: 'カラムを追加', exact: true }).click()
  const editor = page.getByRole('form', { name: 'カラムを追加', exact: true })
  await editor.getByLabel('カラム名', { exact: true }).fill(title)
  await editor.getByLabel('Twitterの検索条件').fill(query)
  if (top) await editor.getByLabel('表示順').selectOption('Top')
  await editor.getByRole('button', { name: '追加して検索' }).click()
  await expect(
    page
      .getByRole('region', { name: title, exact: true })
      .locator('article')
      .first(),
  ).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/deck')
  await page.waitForLoadState('networkidle')
})

test('creates independent columns, edits, reorders, and restores saved conditions', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('button', { name: '名前を変更' }).click()
  await page.getByLabel('調査テーマ・デッキ名').fill('WebMCPの反応')
  await page.getByRole('button', { name: '名前を保存' }).click()
  await addColumn(page, '日本語の反応', 'WebMCP lang:ja')
  await addColumn(page, '話題の投稿', 'WebMCP', true)
  const first = page.getByRole('region', { name: '日本語の反応', exact: true })
  const second = page.getByRole('region', { name: '話題の投稿', exact: true })
  await first.getByRole('button', { name: '続きを読み込む' }).click()
  await expect(first.locator('article')).toHaveCount(2)
  await expect(second.locator('article')).toHaveCount(1)
  await second.getByRole('button', { name: '話題の投稿を左へ' }).click()
  await expect(page.locator('.deck-column h2')).toHaveText([
    '話題の投稿',
    '日本語の反応',
  ])
  await second.getByRole('button', { name: '編集', exact: true }).click()
  await page
    .getByRole('form', { name: 'カラムを編集' })
    .getByLabel('カラム名', { exact: true })
    .fill('公式の投稿')
  await page.getByLabel('Twitterの検索条件').fill('from:OpenAI')
  await page.getByRole('button', { name: '変更を保存' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'WebMCPの反応',
  )
  await expect(page.locator('.deck-column h2')).toHaveText([
    '公式の投稿',
    '日本語の反応',
  ])
  const official = page.getByRole('region', { name: '公式の投稿', exact: true })
  await expect(official.locator('.deck-query')).toHaveText('from:OpenAI')
  await expect(official.locator('article')).toHaveCount(1)
  await official.getByRole('button', { name: '公式の投稿を削除' }).click()
  await expect(page.locator('.deck-column')).toHaveCount(1)
  await page.getByRole('button', { name: '元に戻す' }).click()
  await expect(page.locator('.deck-column h2')).toHaveText([
    '公式の投稿',
    '日本語の反応',
  ])
  expect(errors).toEqual([])
})

test('keeps other columns usable when pagination fails and retries only that column', async ({
  page,
}, testInfo) => {
  await addColumn(page, '失敗する検索', `retry-deck-${testInfo.project.name}`)
  await addColumn(page, '別の検索', 'independent-deck', true)
  const failed = page.getByRole('region', { name: '失敗する検索', exact: true })
  const other = page.getByRole('region', { name: '別の検索', exact: true })
  await failed.getByRole('button', { name: '続きを読み込む' }).click()
  await expect(failed.getByRole('alert')).toBeVisible()
  await expect(failed.locator('article')).toHaveCount(1)
  await other.getByRole('button', { name: '続きを読み込む' }).click()
  await expect(other.locator('article')).toHaveCount(2)
  await failed.getByRole('button', { name: '再試行' }).click()
  await expect(failed.locator('article')).toHaveCount(2)
  await expect(failed.getByRole('alert')).toHaveCount(0)
})

test('keeps columns within narrow viewports and accessible', async ({
  page,
  a11y,
}, testInfo) => {
  await addColumn(page, '日本語の反応', 'WebMCP lang:ja')
  await addColumn(page, '海外の反応', 'WebMCP lang:en', true)
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false)
  }
  await page.setViewportSize({
    width: testInfo.project.name === 'desktop' ? 1440 : 393,
    height: 900,
  })
  await expect(
    page
      .getByRole('region', { name: '日本語の反応', exact: true })
      .locator('article'),
  ).toHaveCount(1)
  expect((await a11y().analyze()).violations).toEqual([])
  await page.screenshot({
    path: testInfo.outputPath('deck.png'),
    fullPage: true,
  })
})

test('does not overwrite an unreadable saved deck on reload', async ({
  page,
}) => {
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

test('keeps the six-column limit when undo and add overlap', async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'twitter-lite-research-deck',
      JSON.stringify({
        version: 1,
        title: '上限の確認',
        columns: Array.from({ length: 6 }, (_, index) => ({
          id: `column-${index}`,
          title: `観点${index}`,
          source: {
            platform: 'twitter',
            query: `limit-${index}`,
            product: 'Latest',
            following: false,
          },
        })),
      }),
    ),
  )
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByRole('button', { name: 'カラムを追加', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: '観点0を削除' }).click()
  await page.getByRole('button', { name: 'カラムを追加', exact: true }).click()
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled()
  await page.getByLabel('カラム名', { exact: true }).fill('追加の観点')
  await page.getByLabel('Twitterの検索条件').fill('new-limit')
  await page.getByRole('button', { name: '追加して検索' }).click()
  await expect(page.locator('.deck-column')).toHaveCount(6)
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled()
  await page.reload()
  await expect(page.locator('.deck-column')).toHaveCount(6)
})

test('creates columns without the secure-context-only randomUUID API', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(crypto, 'randomUUID', { value: undefined }),
  )
  await page.reload()
  await page.waitForLoadState('networkidle')
  await addColumn(page, 'HTTP接続からの調査', 'http-deck')
  await page.reload()
  await expect(
    page
      .getByRole('region', { name: 'HTTP接続からの調査', exact: true })
      .locator('article'),
  ).toHaveCount(1)
})
