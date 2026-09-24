import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'

type NativeTesting = {
  listTools(): { name: string }[]
  executeTool(name: string, input: string): Promise<string | null>
}
type ToolResult = {
  content: { type: string; text: string }[]
  isError?: boolean
}

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ['--enable-blink-features=WebMCP,WebMCPTesting'],
  },
})

async function toolNames(page: Page) {
  return page.evaluate(() =>
    (
      navigator as Navigator & { modelContextTesting: NativeTesting }
    ).modelContextTesting
      .listTools()
      .map((tool) => tool.name)
      .sort(),
  )
}
async function executeTool(
  page: Page,
  name: string,
  input: Record<string, unknown> = {},
): Promise<ToolResult> {
  const result = await page.evaluate(
    ({ name, input }) =>
      (
        navigator as Navigator & { modelContextTesting: NativeTesting }
      ).modelContextTesting.executeTool(name, JSON.stringify(input)),
    { name, input },
  )
  expect(result, `${name} returned a result`).not.toBeNull()
  if (result === null) throw new Error(`${name} returned no result`)
  return JSON.parse(result)
}
const column = (title: string, profileName = 'e2e') => ({
  title,
  profileName,
  source: { kind: 'search', query: 'WebMCP' },
})

let pageErrors: string[]
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/deck')
  await expect
    .poll(() => toolNames(page))
    .toEqual([
      'delete_deck',
      'get_column_posts',
      'get_deck',
      'list_decks',
      'load_more_column',
      'select_deck',
      'set_deck',
    ])
})
test.afterEach(() => expect(pageErrors, 'uncaught browser errors').toEqual([]))

test('creates, replaces, switches and deletes persisted decks through native WebMCP', async ({
  page,
}) => {
  const inventory = await executeTool(page, 'list_decks')
  expect(JSON.parse(inventory.content[0]?.text ?? '').profiles).toEqual([
    'e2e',
    'alternate',
  ])
  const created = await executeTool(page, 'set_deck', {
    title: 'WebMCPの反応',
    columns: [
      { ...column('日本語'), id: 'new' },
      column('別の接続', 'alternate'),
    ],
  })
  expect(created.isError).not.toBe(true)
  const { deck } = JSON.parse(created.content[0]?.text ?? '')
  await expect(page.locator('.deck-column h2')).toHaveText([
    '日本語',
    '別の接続',
  ])
  await expect(
    page.getByText('alternate · Latest · all page 1', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('region', { name: '日本語', exact: true })
    .locator('summary[aria-label="日本語の操作"]')
    .click()
  await page
    .getByRole('region', { name: '日本語', exact: true })
    .getByRole('button', { name: '編集', exact: true })
    .click()
  await expect(page.getByLabel('Twitterの検索条件')).toHaveValue('WebMCP')
  const replaced = await executeTool(page, 'set_deck', {
    deckId: deck.id,
    title: '更新した調査',
    columns: [deck.columns[1]],
  })
  expect(replaced.isError).not.toBe(true)
  await expect(page.getByRole('form', { name: 'カラムを編集' })).toHaveCount(0)
  await expect(page.locator('.deck-column h2')).toHaveText(['別の接続'])
  const another = await executeTool(page, 'set_deck', {
    title: '別の調査',
    columns: [],
  })
  const anotherId = JSON.parse(another.content[0]?.text ?? '').deck.id
  expect(
    (await executeTool(page, 'select_deck', { deckId: deck.id })).isError,
  ).not.toBe(true)
  await page.reload()
  await expect.poll(() => toolNames(page)).toContain('get_deck')
  const restored = JSON.parse(
    (await executeTool(page, 'get_deck')).content[0]?.text ?? '',
  ).deck
  expect(restored).toEqual({
    ...deck,
    title: '更新した調査',
    columns: [deck.columns[1]],
  })
  expect(
    (await executeTool(page, 'delete_deck', { deckId: anotherId })).isError,
  ).not.toBe(true)
  const after = JSON.parse(
    (await executeTool(page, 'list_decks')).content[0]?.text ?? '',
  )
  expect(
    after.decks.some((item: { id: string }) => item.id === anotherId),
  ).toBe(false)
  expect(after.activeDeckId).toBe(deck.id)
})

test('rejects duplicate IDs, unavailable profiles and invalid sources without mutations', async ({
  page,
}) => {
  await executeTool(page, 'set_deck', {
    title: '残す調査',
    columns: [column('残す観点')],
  })
  const saved = await page.evaluate(() =>
    localStorage.getItem('twitter-lite-research-deck'),
  )
  const duplicate = { ...column('不正'), id: 'duplicate' }
  for (const columns of [
    [duplicate, duplicate],
    [column('不明', 'missing')],
    [{ ...column('不正'), source: { kind: 'list', target: 'not-a-list' } }],
  ]) {
    expect(
      (await executeTool(page, 'set_deck', { title: '変更しない', columns }))
        .isError,
    ).toBe(true)
    await expect(page.locator('.deck-column h2')).toHaveText(['残す観点'])
    expect(
      await page.evaluate(() =>
        localStorage.getItem('twitter-lite-research-deck'),
      ),
    ).toBe(saved)
  }
})

test('reports persistence failure while keeping the applied deck visible', async ({
  page,
}) => {
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage) throw new Error('QuotaExceededError')
      setItem.call(this, key, value)
    }
  })
  const result = await executeTool(page, 'set_deck', {
    title: '未保存の調査',
    columns: [],
  })
  expect(result.isError).toBe(true)
  expect(result.content[0]?.text).toContain(
    'applied in this tab but could not be saved',
  )
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    '未保存の調査',
  )
  await expect(page.getByRole('alert')).toContainText('保存できません')
})

test('keeps manual deck creation functional when WebMCP is disabled', async ({
  playwright,
  baseURL,
}) => {
  const browser = await playwright.chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ['--disable-blink-features=WebMCP,WebMCPTesting'],
  })
  try {
    const page = await browser.newPage({ baseURL })
    await page.goto('/')
    await page
      .getByRole('button', { name: 'カラムを追加', exact: true })
      .click()
    await page.getByLabel('カラム名', { exact: true }).fill('手動で調査')
    await page
      .getByRole('combobox', { name: '接続プロファイル', exact: true })
      .selectOption('e2e')
    await page.getByLabel('Twitterの検索条件').fill('ordinary-search')
    await page.getByRole('button', { name: '追加して検索' }).click()
    await expect(
      page.getByText('Latest · all page 1', { exact: true }),
    ).toBeVisible()
  } finally {
    await browser.close()
  }
})

test('reads and pages the bound column profile without mixing sibling feeds', async ({
  page,
}) => {
  const result = await executeTool(page, 'set_deck', {
    title: '接続を比較',
    columns: [column('通常'), column('別の接続', 'alternate')],
  })
  const { deck } = JSON.parse(result.content[0]?.text ?? '')
  await expect(
    page.getByText('alternate · Latest · all page 1', { exact: true }),
  ).toBeVisible()
  const boundId = deck.columns[1].id
  const loaded = JSON.parse(
    (await executeTool(page, 'get_column_posts', { columnId: boundId }))
      .content[0]?.text ?? '',
  )
  expect(loaded.column.profileName).toBe('alternate')
  expect(loaded.posts.map((post: { text: string }) => post.text)).toEqual([
    'alternate · Latest · all page 1',
  ])
  const moreResult = await executeTool(page, 'load_more_column', {
    columnId: boundId,
  })
  expect(moreResult.isError).not.toBe(true)
  const more = JSON.parse(moreResult.content[0]?.text ?? '')
  expect(more).toMatchObject({ loadedCount: 2, offset: 1, hasMore: false })
  expect(more.posts.map((post: { text: string }) => post.text)).toEqual([
    'alternate · Latest · all page 2',
  ])
  await expect(
    page.getByRole('region', { name: '通常', exact: true }).locator('article'),
  ).toHaveCount(1)
  await expect(
    page
      .getByRole('region', { name: '別の接続', exact: true })
      .locator('article'),
  ).toHaveCount(2)
  const slice = JSON.parse(
    (
      await executeTool(page, 'get_column_posts', {
        columnId: boundId,
        offset: 1,
        limit: 1,
      })
    ).content[0]?.text ?? '',
  )
  expect(slice.posts).toEqual(more.posts)
  await executeTool(page, 'set_deck', { title: '別デッキ', columns: [] })
  expect(
    (await executeTool(page, 'get_column_posts', { columnId: boundId }))
      .isError,
  ).toBe(true)
})
