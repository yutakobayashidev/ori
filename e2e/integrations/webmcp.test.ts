import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import { SearchPage } from '../models/SearchPage'

type NativeTesting = {
  listTools(): { name: string }[]
  executeTool(name: string, input: string): Promise<string | null>
}

type ToolResult = {
  content: { type: string; text: string }[]
  isError?: boolean
}

type FeedResult = {
  request: { kind: string; query: string; product: string; following: boolean }
  posts: { id: string; text: string; url: string }[]
  loadedCount: number
  offset: number
  nextOffset: number | null
  hasMore: boolean
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

async function executeFeedTool(
  page: Page,
  name: string,
  input: Record<string, unknown> = {},
): Promise<FeedResult> {
  const result = await executeTool(page, name, input)
  expect(result.isError, JSON.stringify(result.content)).not.toBe(true)
  expect(result.content[0]?.type).toBe('text')
  return JSON.parse(result.content[0]?.text ?? '')
}

let pageErrors: string[]

test.beforeEach(async ({ page }, testInfo) => {
  pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  if (testInfo.title === 'joins pagination already started by scrolling') return
  // Keep pagination under the tool's control without replacing WebMCP itself.
  await page.addInitScript(() => {
    window.IntersectionObserver = class {
      readonly root = null
      readonly rootMargin = '0px'
      readonly scrollMargin = '0px'
      readonly thresholds = [0]
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    }
  })
})

test.afterEach(() => {
  expect(pageErrors, 'uncaught browser errors').toEqual([])
})

test('searches through native WebMCP and keeps results synchronized with the UI', async ({
  homePage,
  page,
  searchPage,
}) => {
  await homePage.goTo()
  await expect.poll(() => toolNames(page)).toEqual(['search_posts'])

  const first = await executeFeedTool(page, 'search_posts', {
    q: 'AI',
    product: 'Top',
    following: true,
  })

  expect(first.request).toMatchObject({
    kind: 'search',
    query: 'AI filter:follows',
    product: 'Top',
    following: true,
  })
  expect(first.posts.map((post) => post.text)).toEqual(['Top · follows page 1'])
  expect(first).toMatchObject({ loadedCount: 1, offset: 0, hasMore: true })
  await expect(page).toHaveURL(/\/search\?/)
  await expect(searchPage.queryInputLocator).toHaveValue('AI')
  await expect(searchPage.topRankingLocator).toBeChecked()
  await expect(searchPage.followingOnlyLocator).toBeChecked()
  await expect(
    page.getByText(first.posts[0]?.text ?? '', { exact: true }),
  ).toBeVisible()

  await expect
    .poll(() => toolNames(page))
    .toEqual(['get_loaded_posts', 'load_more_posts', 'search_posts'])
  const more = await executeFeedTool(page, 'load_more_posts')
  expect(more.posts.map((post) => post.text)).toEqual(['Top · follows page 2'])
  expect(more).toMatchObject({ loadedCount: 2, offset: 1, hasMore: false })
  await expect(searchPage.articlesLocator).toHaveCount(2)
  await expect(searchPage.endOfFeedLocator).toBeVisible()

  const slice = await executeFeedTool(page, 'get_loaded_posts', {
    offset: 1,
    limit: 1,
  })
  expect(slice.posts).toEqual(more.posts)
  expect(slice).toMatchObject({ loadedCount: 2, offset: 1, hasMore: false })

  const end = await executeFeedTool(page, 'load_more_posts')
  expect(end).toMatchObject({ posts: [], loadedCount: 2, hasMore: false })
  await expect(searchPage.articlesLocator).toHaveCount(2)

  // SPA navigation must unregister the old feed's tools in the same document.
  await page.getByRole('link', { name: 'ユーザー', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect.poll(() => toolNames(page)).toEqual(['search_posts'])
})

test('rejects invalid search conditions without navigating or dropping the active feed', async ({
  homePage,
  page,
  searchPage,
}) => {
  await homePage.goTo()
  await expect.poll(() => toolNames(page)).toContain('search_posts')
  const first = await executeFeedTool(page, 'search_posts', { q: 'existing' })
  const previousURL = page.url()
  const result = await executeTool(page, 'search_posts', {
    q: 'invalid dates',
    since: '2026-09-24',
    until: '2026-09-23',
  })

  expect(result.isError).toBe(true)
  expect(result.content[0]?.type).toBe('text')
  expect(() => JSON.parse(result.content[0]?.text ?? '')).not.toThrow()
  await expect(page).toHaveURL(previousURL)
  await expect(searchPage.queryInputLocator).toHaveValue('existing')
  const current = await executeFeedTool(page, 'get_loaded_posts')
  expect(current.posts).toEqual(first.posts)
})

test('retries a failed continuation without losing the first page', async ({
  homePage,
  page,
  searchPage,
}, testInfo) => {
  await homePage.goTo()
  await expect.poll(() => toolNames(page)).toContain('search_posts')
  const first = await executeFeedTool(page, 'search_posts', {
    q: `retry-webmcp-${testInfo.project.name}`,
  })
  const failed = await executeTool(page, 'load_more_posts')
  expect(failed.isError, JSON.stringify(failed.content)).toBe(true)
  await expect(searchPage.continuationErrorLocator).toBeVisible()
  const retained = await executeFeedTool(page, 'get_loaded_posts')
  expect(retained.posts).toEqual(first.posts)

  const recovered = await executeFeedTool(page, 'load_more_posts')
  expect(recovered.posts.map((post) => post.text)).toEqual([
    'Latest · all page 2',
  ])
  expect(recovered).toMatchObject({ loadedCount: 2, offset: 1, hasMore: false })
  await expect(searchPage.continuationErrorLocator).toHaveCount(0)
  await expect(searchPage.articlesLocator).toHaveCount(2)
  await expect(searchPage.endOfFeedLocator).toBeVisible()
})

test('joins pagination already started by scrolling', async ({
  homePage,
  page,
  searchPage,
}, testInfo) => {
  await homePage.goTo()
  await expect.poll(() => toolNames(page)).toContain('search_posts')
  await executeFeedTool(page, 'search_posts', {
    q: `slow-webmcp-${testInfo.project.name}`,
  })
  await expect(searchPage.loadingRailLocator).toBeVisible()

  const more = await executeFeedTool(page, 'load_more_posts')
  expect(more.posts.map((post) => post.text)).toEqual(['Latest · all page 2'])
  expect(more).toMatchObject({ loadedCount: 2, offset: 1, hasMore: false })
  await expect(searchPage.articlesLocator).toHaveCount(2)
  await expect(searchPage.endOfFeedLocator).toBeVisible()
})

test('keeps the normal search form functional without native WebMCP', async ({
  playwright,
  baseURL,
}, testInfo) => {
  const browser = await playwright.chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ['--disable-blink-features=WebMCP,WebMCPTesting'],
  })
  const page = await browser.newPage({ baseURL })
  const searchPage = new SearchPage(page)
  try {
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await searchPage.goTo()
    expect(await page.evaluate(() => Boolean(document.modelContext))).toBe(
      false,
    )
    await searchPage.search('ordinary search')
    await expect(page.getByText('Latest · all page 1')).toBeVisible()
    await expect(page.getByText('Latest · all page 2')).toBeVisible()
  } catch (error) {
    await testInfo.attach('unsupported-browser-state', {
      body: JSON.stringify({ url: page.url(), html: await page.content() }),
      contentType: 'application/json',
    })
    await testInfo.attach('unsupported-browser-screen', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
    throw error
  } finally {
    await browser.close()
  }
})

test('creates a deck through native WebMCP, edits it, and restores its saved definition', async ({
  page,
}) => {
  await page.goto('/deck')
  await page.waitForLoadState('networkidle')
  await expect
    .poll(() => toolNames(page))
    .toEqual(['get_deck', 'search_posts', 'set_deck'])
  const result = await executeTool(page, 'set_deck', {
    title: 'WebMCPの反応',
    columns: [
      { id: 'new', title: '日本語', source: { query: 'WebMCP lang:ja' } },
      { title: '話題', source: { query: 'WebMCP', product: 'Top' } },
    ],
  })
  expect(result.isError).not.toBe(true)
  await expect(page.locator('.deck-column h2')).toHaveText(['日本語', '話題'])
  await expect(page.getByText('Latest · all page 1')).toBeVisible()
  await expect(page.getByText('Top · all page 1')).toBeVisible()
  const before = await executeTool(page, 'get_deck')
  const { deck } = JSON.parse(before.content[0]?.text ?? '')
  expect(deck.columns[0].id).toBe('new')
  // Tool-provided IDs must not collide with the UI's new-column editing state.
  await page
    .getByRole('region', { name: '日本語', exact: true })
    .getByRole('button', { name: '編集', exact: true })
    .click()
  await expect(page.getByLabel('Twitterの検索条件')).toHaveValue(
    'WebMCP lang:ja',
  )
  const edited = await executeTool(page, 'set_deck', {
    title: '更新した調査',
    columns: [deck.columns[1]],
  })
  expect(edited.isError).not.toBe(true)
  await expect(page.getByRole('form', { name: 'カラムを編集' })).toHaveCount(0)
  await expect(page.locator('.deck-column h2')).toHaveText(['話題'])
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    '更新した調査',
  )
  await expect.poll(() => toolNames(page)).toContain('get_deck')
  const restored = await executeTool(page, 'get_deck')
  expect(JSON.parse(restored.content[0]?.text ?? '').deck.columns[0].id).toBe(
    deck.columns[1].id,
  )
  await page.getByRole('link', { name: 'ユーザー', exact: true }).click()
  await expect.poll(() => toolNames(page)).toEqual(['search_posts'])
})

test('rejects an invalid deck without changing the visible or saved columns', async ({
  page,
}) => {
  await page.goto('/deck')
  await page.waitForLoadState('networkidle')
  await expect.poll(() => toolNames(page)).toContain('set_deck')
  await executeTool(page, 'set_deck', {
    title: '残す調査',
    columns: [{ title: '残す観点', source: { query: 'AI' } }],
  })
  const saved = await page.evaluate(() =>
    localStorage.getItem('twitter-lite-research-deck'),
  )
  const column = { id: 'duplicate', title: '不正', source: { query: 'AI' } }
  const result = await executeTool(page, 'set_deck', {
    title: '変更しない',
    columns: [column, column],
  })
  expect(result.isError).toBe(true)
  await expect(page.locator('.deck-column h2')).toHaveText(['残す観点'])
  expect(
    await page.evaluate(() =>
      localStorage.getItem('twitter-lite-research-deck'),
    ),
  ).toBe(saved)
})

test('reports a deck persistence failure instead of claiming it was saved', async ({
  page,
}) => {
  await page.goto('/deck')
  await page.waitForLoadState('networkidle')
  await expect.poll(() => toolNames(page)).toContain('set_deck')
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError')
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
