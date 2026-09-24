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
