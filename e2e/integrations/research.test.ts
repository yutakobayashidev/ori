import type { DeckColumn } from '../../src/features/decks/model'
import type { ResearchRun } from '../../src/features/research/model'
import { expect, test } from '../fixtures'
import {
  closeMobileSidebar,
  showDeckManagement,
  showResearch,
} from '../workspace'

test('pushes the current research snapshot on each SSE connection', async ({
  page,
}) => {
  await page.goto('/deck')
  const snapshots = await page.evaluate(async () => {
    const connect = () =>
      new Promise<unknown>((resolve, reject) => {
        const events = new EventSource('/api/research/events')
        const timer = setTimeout(() => {
          events.close()
          reject(new Error('SSE timed out'))
        }, 5000)
        events.onmessage = (event) => {
          clearTimeout(timer)
          events.close()
          resolve(JSON.parse(event.data))
        }
        events.onerror = () => {
          clearTimeout(timer)
          events.close()
          reject(new Error('SSE failed'))
        }
      })
    return [await connect(), await connect()]
  })
  expect(snapshots).toEqual([
    { configured: false, run: null, history: [] },
    { configured: false, run: null, history: [] },
  ])
})

test('restores the conversation and growing temporary deck from reconnect snapshots', async ({
  page,
}) => {
  await page.goto('/deck')
  await showDeckManagement(page)
  await page.getByRole('button', { name: 'カラムを追加', exact: true }).click()
  const accounts = page.getByRole('combobox', {
    name: '接続プロファイル',
    exact: true,
  })
  await accounts.selectOption({ label: 'e2e' })
  const connectionId = await accounts.inputValue()
  await page.keyboard.press('Escape')
  await closeMobileSidebar(page)
  const run: ResearchRun = {
    id: '36ad8cc7-318c-46ae-94fa-28d30336f027',
    threadId: 'conversation-test',
    connectionIds: [connectionId],
    topic: '既存の観点を使って調査して',
    status: 'running',
    startedAt: Date.now(),
    deckVersion: 1,
    citations: [],
    message: '既存の検索条件を再利用しています。',
    messages: [
      { id: 'user-1', role: 'user', text: '既存の観点を使って調査して' },
      { id: 'tool-1', role: 'tool', text: 'list_decks: 完了' },
      {
        id: 'assistant-1',
        role: 'assistant',
        text: '既存の検索条件を再利用しています。',
      },
    ],
    deck: {
      id: 'generated-plan',
      title: '会話からの調査',
      columns: [
        {
          id: 'one',
          title: '最初の観点',
          connectionId,
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
  }
  await page.route('**/api/research/events', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ configured: true, run })}\n\n`,
    }),
  )
  await page.reload()
  await showResearch(page)
  const conversation = page.getByRole('log', { name: '調査の会話' })
  await expect(conversation).toContainText('既存の観点を使って調査して')
  await expect(conversation).toContainText('list_decks: 完了')
  await expect(conversation).toContainText('既存の検索条件を再利用しています。')
  await expect(
    conversation.locator('[data-slot="bubble-content"]'),
  ).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(page.locator('.deck-column h2')).toHaveText(['最初の観点'])
  run.deckVersion = 2
  run.status = 'complete'
  run.messages.push({
    id: 'assistant-2',
    role: 'assistant',
    text: '比較する観点を追加しました。',
  })
  run.deck?.columns.push({
    id: 'two',
    title: '比較の観点',
    connectionId,
    source: {
      platform: 'twitter',
      kind: 'search',
      query: 'WebMCP lang:ja',
      product: 'Latest',
      following: false,
    },
  })
  await page.reload()
  await showResearch(page)
  await expect(conversation).toContainText('既存の観点を使って調査して')
  await expect(conversation).toContainText('比較する観点を追加しました。')
  await expect(page.locator('.deck-column h2')).toHaveText([
    '最初の観点',
    '比較の観点',
  ])
  await closeMobileSidebar(page)
  await expect(
    page.getByRole('button', { name: 'デッキとして保存', exact: true }),
  ).toBeEnabled()
  await showResearch(page)
  const accountPicker = page.getByRole('button', {
    name: '接続アカウント · 1件',
  })
  await accountPicker.click()
  await expect(accountPicker).toHaveAttribute('aria-expanded', 'true')
  await expect(
    page.getByRole('checkbox', { name: 'e2e · Twitter' }),
  ).toBeChecked()
  await accountPicker.click()
  await expect(accountPicker).toHaveAttribute('aria-expanded', 'false')
  await page.getByLabel('メッセージ', { exact: true }).fill('この観点を詳しく')
  await expect(
    page.getByRole('button', { name: '送信', exact: true }),
  ).toBeEnabled()
  await page
    .getByRole('button', { name: 'サイドバーを閉じる', exact: true })
    .click()
  run.deckVersion = 3
  if (run.deck) run.deck.title = '閉じている間に更新された調査'
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    '閉じている間に更新された調査',
    { timeout: 15000 },
  )
  await showResearch(page)
  await expect(page.getByLabel('メッセージ', { exact: true })).toHaveValue(
    'この観点を詳しく',
  )
  await page.setViewportSize({ width: 600, height: 900 })
  await expect(
    page.locator('[data-sidebar="sidebar"][data-mobile="true"]'),
  ).toHaveCount(1)
  await showResearch(page)
  await expect(page.getByLabel('メッセージ', { exact: true })).toHaveValue(
    'この観点を詳しく',
  )
  await page.getByRole('button', { name: '接続アカウント · 1件' }).click()
  await page.getByRole('checkbox', { name: 'e2e · Twitter' }).uncheck()
  await page.setViewportSize({ width: 1100, height: 900 })
  await expect(
    page.locator('[data-sidebar="sidebar"][data-mobile="true"]'),
  ).toHaveCount(0)
  await showResearch(page)
  await expect(page.getByLabel('メッセージ', { exact: true })).toHaveValue(
    'この観点を詳しく',
  )
  await page.getByRole('button', { name: '接続アカウント · 0件' }).click()
  await expect(
    page.getByRole('checkbox', { name: 'e2e · Twitter' }),
  ).not.toBeChecked()
  await page.setViewportSize({ width: 600, height: 900 })
  await expect(
    page.locator('[data-sidebar="sidebar"][data-mobile="true"]'),
  ).toHaveCount(1)
  await showResearch(page)
  await expect(page.getByLabel('メッセージ', { exact: true })).toHaveValue(
    'この観点を詳しく',
  )
  await page.getByRole('button', { name: '接続アカウント · 0件' }).click()
  await expect(
    page.getByRole('checkbox', { name: 'e2e · Twitter' }),
  ).not.toBeChecked()
})

test('rejects a different tailnet owner at the SSE endpoint', async ({
  request,
}) => {
  const response = await request.get('/api/research/events', {
    headers: { 'Tailscale-User-Login': 'someone-else@twitter-lite.invalid' },
  })
  expect(response.status()).toBe(403)
})

test('renders Markdown and reveals an unloaded citation in an offscreen deck column', async ({
  page,
  a11y,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/deck')
  await showDeckManagement(page)
  await page.getByRole('button', { name: 'カラムを追加', exact: true }).click()
  const accounts = page.getByRole('combobox', {
    name: '接続プロファイル',
    exact: true,
  })
  await accounts.selectOption({ label: 'e2e' })
  const connectionId = await accounts.inputValue()
  await page.keyboard.press('Escape')
  await closeMobileSidebar(page)
  const source: DeckColumn = {
    id: 'citation-column-2',
    title: '引用の観点',
    connectionId,
    source: {
      platform: 'twitter',
      kind: 'search',
      query: 'citation-query-2',
      product: 'Latest',
      following: false,
    },
  }
  const columns: DeckColumn[] = ['概要', '比較'].map((title, index) => ({
    id: `citation-column-${index}`,
    title,
    connectionId,
    source: {
      platform: 'twitter',
      kind: 'search',
      query: `citation-query-${index}`,
      product: 'Latest',
      following: false,
    },
  }))
  columns.push(source)
  const run: ResearchRun = {
    id: '973ae084-18ed-4674-8899-c75851e51d1b',
    topic: '引用を確認',
    status: 'complete',
    startedAt: Date.now(),
    deckVersion: 1,
    message: '',
    deck: { id: 'citation-deck', title: '引用付きの調査', columns },
    messages: [
      {
        id: 'answer',
        role: 'assistant',
        text: '## 調査結果\n\n**重要な発見**です。\n\n- [根拠の投稿](https://x.com/author/status/123456789?s=20)\n\n| 観点 | 結果 |\n| --- | --- |\n| 投稿 | 確認済み |\n\n`コード`も表示します。',
      },
    ],
    citations: [
      {
        column: source,
        post: {
          key: 'twitter:123456789',
          nativeId: '123456789',
          platform: 'twitter',
          url: 'https://twitter.com/author/status/123456789',
          text: 'AIが調査時に取得した引用本文',
          author: { name: '引用元の著者', handle: 'author' },
        },
      },
    ],
  }
  await page.route('**/api/research/events', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ configured: true, run })}\n\n`,
    }),
  )
  await page.reload()
  await showResearch(page)
  const chat = page.getByRole('log', { name: '調査の会話' })
  await expect(chat.getByRole('heading', { name: '調査結果' })).toBeVisible()
  await expect(chat.getByRole('heading', { name: '調査結果' })).toHaveCSS(
    'font-weight',
    '600',
  )
  await expect(chat.locator('ul')).toHaveCSS('list-style-type', 'disc')
  await expect(
    chat.locator('strong').filter({ hasText: '重要な発見' }),
  ).toBeVisible()
  await expect(chat.getByRole('table')).toBeVisible()
  await expect(
    page.getByText('AIが調査時に取得した引用本文', { exact: true }),
  ).toHaveCount(0)
  await chat.getByRole('link', { name: '根拠の投稿' }).click()
  const card = page.locator(
    '.research-post[data-post-url="https://twitter.com/author/status/123456789"]',
  )
  await expect(card).toBeVisible()
  await expect(card).toHaveClass(/citation-highlight/)
  await expect(card).toBeFocused()
  await expect(card).toContainText('調査時に取得した投稿')
  await expect(card).toContainText('AIが調査時に取得した引用本文')
  expect(
    await page.locator('.deck-board').evaluate((element) => element.scrollLeft),
  ).toBeGreaterThan(0)
  expect(page.context().pages()).toHaveLength(1)
  expect((await a11y().analyze()).violations).toEqual([])
})

test('explains unconfigured Codex and prevents starting research without affecting the deck', async ({
  page,
  a11y,
}) => {
  await page.goto('/deck')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toBeVisible()
  const originalTitle = await heading.textContent()
  await showResearch(page)
  const panel = page.getByRole('complementary', { name: '調査チャット' })
  await expect(panel).toBeVisible()
  await expect(
    panel.getByText('自宅のCodexへの接続が設定されていません。'),
  ).toBeVisible()
  await expect(
    panel.getByRole('button', { name: '送信', exact: true }),
  ).toBeDisabled()
  await expect(panel.getByLabel('メッセージ', { exact: true })).toBeDisabled()
  const accessibility = await a11y().analyze()
  expect(accessibility.violations).toEqual([])
  await closeMobileSidebar(page)
  await expect(heading).toHaveText(originalTitle ?? '')
  await showDeckManagement(page)
  await page.getByRole('button', { name: 'デッキを作成', exact: true }).click()
  await page.getByLabel('新しいデッキ名').fill('手動の調査')
  await page.getByRole('button', { name: '作成', exact: true }).click()
  await closeMobileSidebar(page)
  await expect(heading).toHaveText('手動の調査')
  await showResearch(page)
  await expect(panel).toBeVisible()
})
