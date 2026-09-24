// @vitest-environment node
import { expect, it, vi } from 'vitest'
import type { Connection } from '../connections/model'
import type { Deck } from '../decks/model'
import type { ResearchPost } from '../platforms/types'
import { createResearchTools } from './agent-tools.server'

const savedDecks = vi.hoisted(() => ({ list: vi.fn(), load: vi.fn() }))
vi.mock('../decks/repository.server', () => ({
  listDecks: savedDecks.list,
  loadDeck: savedDecks.load,
}))

const account: Connection = {
  id: 'selected',
  platform: 'twitter',
  origin: 'https://relay.invalid',
  accountId: null,
  displayName: 'Selected',
  status: 'connected',
}
const mastodon: Connection = {
  ...account,
  id: 'mastodon',
  platform: 'mastodon',
  origin: 'https://mastodon.invalid',
}
const column = {
  id: 'column',
  title: 'Research',
  connectionId: account.id,
  source: { kind: 'search', query: 'WebMCP' },
}
const post: ResearchPost = {
  key: 'twitter:1',
  platform: 'twitter',
  nativeId: '1',
  url: 'https://x.com/alice/status/1',
  text: 'Evidence from a public post',
  author: { name: 'Alice', handle: 'alice' },
}
const open = { title: 'Research', columns: [column] }

it('publishes JSON tool definitions and only the explicitly selected public account fields', async () => {
  const tools = createResearchTools(
    [{ ...account, token: 'not-public' } as Connection],
    vi.fn(),
    vi.fn(),
  )
  expect(tools.definitions.map((tool) => tool.name)).toEqual([
    'list_connections',
    'list_lists',
    'list_decks',
    'get_deck',
    'open_temporary_deck',
    'fetch_column_posts',
  ])
  const definition = tools.definitions.find(
    (tool) => tool.name === 'open_temporary_deck',
  )
  expect(JSON.parse(JSON.stringify(definition?.inputSchema))).toMatchObject({
    type: 'object',
    additionalProperties: false,
  })
  expect(await tools.execute('list_connections', {})).toEqual({
    ok: true,
    connections: [account],
  })
  expect(await tools.execute('save_deck', {})).toMatchObject({
    ok: false,
    error: { code: 'unknown-tool' },
  })
})

it('opens a validated temporary mixed-platform deck and forwards it to the host callback', async () => {
  const onDeck = vi.fn()
  const tools = createResearchTools([account, mastodon], onDeck, vi.fn())
  const result = await tools.execute('open_temporary_deck', {
    title: 'Mixed',
    columns: [
      column,
      {
        title: 'Tag',
        connectionId: mastodon.id,
        source: { platform: 'mastodon', kind: 'hashtag', target: 'WebMCP' },
      },
    ],
  })
  expect(result).toMatchObject({
    ok: true,
    persisted: false,
    deck: {
      title: 'Mixed',
      columns: [
        {
          id: 'column',
          source: { platform: 'twitter', product: 'Latest', following: false },
        },
        { connectionId: 'mastodon' },
      ],
    },
  })
  expect(onDeck).toHaveBeenCalledTimes(1)
  expect(tools.evidenceCount).toBe(0)
})

it('updates the same temporary deck and keeps explicitly reused column IDs', async () => {
  const views: Deck[] = []
  const tools = createResearchTools(
    [account],
    (deck) => views.push(deck),
    vi.fn(),
  )
  await tools.execute('open_temporary_deck', open)
  await tools.execute('open_temporary_deck', {
    title: 'Refined research',
    columns: [
      { ...column, source: { kind: 'search', query: 'WebMCP testing' } },
    ],
  })
  expect(views).toHaveLength(2)
  expect(views[1]).toMatchObject({
    id: views[0]?.id,
    title: 'Refined research',
    columns: [{ id: 'column', source: { query: 'WebMCP testing' } }],
  })
})

it('lists and reads saved decks only within the selected account scope', async () => {
  const deck: Deck = {
    ...open,
    id: 'saved',
    columns: [
      {
        ...column,
        source: {
          platform: 'twitter',
          kind: 'search',
          query: 'WebMCP',
          product: 'Latest',
          following: false,
        },
      },
    ],
  }
  const record = { ...deck, revision: 3, createdAt: 1, updatedAt: 2 }
  const outside = {
    ...record,
    id: 'outside',
    columns: [{ ...deck.columns[0], connectionId: 'not-selected' }],
  }
  savedDecks.list.mockReturnValue([record, outside])
  savedDecks.load.mockReturnValue(record)
  const onDeck = vi.fn()
  const tools = createResearchTools([account], onDeck, vi.fn())
  expect(await tools.execute('list_decks', {})).toEqual({
    ok: true,
    decks: [{ id: 'saved', title: 'Research', revision: 3, columnCount: 1 }],
  })
  expect(await tools.execute('get_deck', { deckId: 'saved' })).toEqual({
    ok: true,
    persisted: true,
    revision: 3,
    deck,
  })
  expect(onDeck).not.toHaveBeenCalled()
  savedDecks.load.mockReturnValue(outside)
  expect(await tools.execute('get_deck', { deckId: 'outside' })).toMatchObject({
    ok: false,
    error: { code: 'deck-unavailable' },
  })
})

it('fetches the current context directly and creates a separate temporary view when changed', async () => {
  const context: Deck = {
    ...open,
    id: 'saved',
    columns: [
      {
        ...column,
        source: {
          platform: 'twitter',
          kind: 'search',
          query: 'WebMCP',
          product: 'Latest',
          following: false,
        },
      },
    ],
  }
  const fetchPage = vi.fn().mockResolvedValue({ posts: [post] })
  const views: Deck[] = []
  const tools = createResearchTools(
    [account],
    (deck) => views.push(deck),
    fetchPage,
    { contextDeck: context },
  )
  expect(
    await tools.execute('fetch_column_posts', { columnId: 'column' }),
  ).toMatchObject({ ok: true, posts: [{ key: post.key }] })
  expect(fetchPage).toHaveBeenCalledWith(context.columns[0], undefined)
  expect(views).toHaveLength(0)
  await tools.execute('open_temporary_deck', { ...open, title: 'Refined' })
  expect(views[0]?.id).not.toBe('saved')
  expect(context.title).toBe('Research')
  expect(views[0]?.columns[0]?.id).toBe('column')
})

it('accepts a mixed context but fetches only columns in the selected account scope', async () => {
  const fetchPage = vi.fn().mockResolvedValue({ posts: [post] })
  const tools = createResearchTools([account], vi.fn(), fetchPage, {
    contextDeck: {
      ...open,
      id: 'saved',
      columns: [
        {
          ...column,
          source: {
            platform: 'twitter',
            kind: 'search',
            query: 'WebMCP',
            product: 'Latest',
            following: false,
          },
        },
        {
          id: 'mastodon-column',
          title: 'Mastodon',
          connectionId: mastodon.id,
          source: { platform: 'mastodon', kind: 'hashtag', target: 'WebMCP' },
        },
      ],
    },
  })
  expect(await tools.execute('list_connections', {})).toEqual({
    ok: true,
    connections: [account],
  })
  expect(
    await tools.execute('fetch_column_posts', { columnId: 'mastodon-column' }),
  ).toMatchObject({ ok: false, error: { code: 'account-unavailable' } })
  expect(fetchPage).not.toHaveBeenCalled()
  expect(
    await tools.execute('fetch_column_posts', { columnId: 'column' }),
  ).toMatchObject({ ok: true, posts: [{ key: post.key }] })
  expect(fetchPage).toHaveBeenCalledTimes(1)
})

it('continues updating the generated view while fetching the newly selected context', async () => {
  const context: Deck = {
    id: 'another-saved-deck',
    title: 'Another source',
    columns: [
      {
        ...column,
        id: 'another-column',
        source: {
          platform: 'twitter',
          kind: 'search',
          query: 'Mastodon',
          product: 'Latest',
          following: false,
        },
      },
    ],
  }
  const fetchPage = vi.fn().mockResolvedValue({ posts: [] })
  const views: Deck[] = []
  const tools = createResearchTools(
    [account],
    (deck) => views.push(deck),
    fetchPage,
    {
      contextDeck: context,
      temporaryDeckId: 'previous-generated-plan',
    },
  )
  await tools.execute('fetch_column_posts', { columnId: 'another-column' })
  expect(fetchPage).toHaveBeenCalledWith(context.columns[0], undefined)
  await tools.execute('open_temporary_deck', open)
  expect(views[0]?.id).toBe('previous-generated-plan')
  expect(context.id).toBe('another-saved-deck')
  expect(context.columns[0]?.id).toBe('another-column')
})

it.each([
  { deckId: 'saved' },
  { expectedRevision: 1 },
  { columns: [{ ...column, connectionId: 'not-selected' }] },
])('rejects saved deck mutations and unselected accounts', async (extra) => {
  const onDeck = vi.fn()
  const tools = createResearchTools([account], onDeck, vi.fn())
  expect(
    await tools.execute('open_temporary_deck', { ...open, ...extra }),
  ).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
  expect(onDeck).not.toHaveBeenCalled()
})

it('fetches with the current account binding, filters private fields and caps returned posts at20', async () => {
  const fetchPage = vi.fn().mockResolvedValue({
    posts: Array.from({ length: 25 }, (_, index) => ({
      ...post,
      key: `twitter:${index}`,
      token: 'secret',
      _raw: { token: 'secret' },
      html: '<script>untrusted()</script>',
    })),
    nextCursor: 'next',
  })
  const tools = createResearchTools([account], vi.fn(), fetchPage)
  await tools.execute('open_temporary_deck', open)
  const result = await tools.execute('fetch_column_posts', {
    columnId: 'column',
  })
  expect(fetchPage).toHaveBeenCalledWith(
    expect.objectContaining({
      connectionId: account.id,
      source: {
        platform: 'twitter',
        kind: 'search',
        query: 'WebMCP',
        product: 'Latest',
        following: false,
      },
    }),
    undefined,
  )
  expect(result).toMatchObject({
    ok: true,
    truncated: true,
    nextCursor: 'next',
    fetchesRemaining: 11,
  })
  expect(JSON.stringify(result)).not.toContain('secret')
  expect(JSON.stringify(result)).not.toContain('<script>')
  expect(tools.evidenceCount).toBe(20)
})

it('rejects arbitrary and cross-column cursors while allowing the returned continuation', async () => {
  const fetchPage = vi
    .fn()
    .mockResolvedValueOnce({ posts: [post], nextCursor: 'first-next' })
    .mockResolvedValueOnce({ posts: [post] })
  const tools = createResearchTools([account], vi.fn(), fetchPage)
  await tools.execute('open_temporary_deck', {
    ...open,
    columns: [column, { ...column, id: 'other' }],
  })
  expect(
    await tools.execute('fetch_column_posts', {
      columnId: 'column',
      cursor: 'invented',
    }),
  ).toMatchObject({ ok: false, error: { code: 'cursor-invalid' } })
  await tools.execute('fetch_column_posts', { columnId: 'column' })
  expect(
    await tools.execute('fetch_column_posts', {
      columnId: 'other',
      cursor: 'first-next',
    }),
  ).toMatchObject({ ok: false, error: { code: 'cursor-invalid' } })
  expect(
    await tools.execute('fetch_column_posts', {
      columnId: 'column',
      cursor: 'first-next',
    }),
  ).toMatchObject({ ok: true, hasMore: false })
  expect(
    await tools.execute('fetch_column_posts', { columnId: 'column' }),
  ).toMatchObject({ ok: false, error: { code: 'cursor-invalid' } })
  expect(fetchPage).toHaveBeenCalledTimes(2)
  expect(tools.evidenceCount).toBe(1)
})

it('caps all upstream calls including failures and does not expose diagnostic secrets', async () => {
  const fetchPage = vi
    .fn()
    .mockRejectedValue(new Error('authorization: Bearer secret-token'))
  const tools = createResearchTools([account], vi.fn(), fetchPage)
  await tools.execute('open_temporary_deck', open)
  for (let index = 0; index < 12; index++) {
    const result = await tools.execute('fetch_column_posts', {
      columnId: 'column',
    })
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'source-unavailable' },
    })
    expect(JSON.stringify(result)).not.toContain('secret-token')
  }
  await tools.execute('open_temporary_deck', open)
  expect(
    await tools.execute('fetch_column_posts', { columnId: 'column' }),
  ).toMatchObject({ ok: false, error: { code: 'budget-exhausted' } })
  expect(fetchPage).toHaveBeenCalledTimes(12)
})

it('discards a late result from a replaced view and prevents concurrent pagination', async () => {
  let finish: (page: { posts: ResearchPost[] }) => void = () => {}
  const fetchPage = vi.fn(
    () =>
      new Promise<{ posts: ResearchPost[] }>((resolve) => {
        finish = resolve
      }),
  )
  const tools = createResearchTools([account], vi.fn(), fetchPage)
  await tools.execute('open_temporary_deck', open)
  const pending = tools.execute('fetch_column_posts', { columnId: 'column' })
  expect(
    await tools.execute('fetch_column_posts', { columnId: 'column' }),
  ).toMatchObject({ ok: false, error: { code: 'busy' } })
  await tools.execute('open_temporary_deck', { ...open, title: 'New view' })
  finish({ posts: [post] })
  expect(await pending).toMatchObject({
    ok: false,
    error: { code: 'view-changed' },
  })
  expect(tools.evidenceCount).toBe(0)
})

it('does not allow the host callback to mutate the bound fetch definition', async () => {
  const onDeck = (deck: Deck) => {
    const current = deck.columns[0]
    if (current) current.connectionId = 'altered'
  }
  const fetchPage = vi.fn().mockResolvedValue({ posts: [] })
  const tools = createResearchTools([account], onDeck, fetchPage)
  await tools.execute('open_temporary_deck', open)
  await tools.execute('fetch_column_posts', { columnId: 'column' })
  expect(fetchPage).toHaveBeenCalledWith(
    expect.objectContaining({ connectionId: account.id }),
    undefined,
  )
})
