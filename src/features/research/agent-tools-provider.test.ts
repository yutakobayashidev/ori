// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import type { Connection } from '../connections/model'
import { createResearchTools } from './agent-tools.server'

const upstream = vi.hoisted(() => ({
  connection: vi.fn(),
  reader: vi.fn(),
  search: vi.fn(),
  user: vi.fn(),
  list: vi.fn(),
  mastodon: vi.fn(),
  mapPost: vi.fn(),
  twitterLists: vi.fn(),
  mastodonLists: vi.fn(),
}))
vi.mock('../connections/repository.server', () => ({
  requireTwitterConnection: upstream.connection,
}))
vi.mock('../posts/bird-client.server', () => ({
  getBirdReader: upstream.reader,
}))
vi.mock('../posts/post-service', () => ({
  loadListChoices: upstream.twitterLists,
  searchPage: upstream.search,
  loadUserPage: upstream.user,
  loadListPage: upstream.list,
}))
vi.mock('../platforms/twitter', () => ({ mapTwitterPost: upstream.mapPost }))
vi.mock('../platforms/mastodon-feed.server', () => ({
  fetchMastodonLists: upstream.mastodonLists,
  fetchMastodonPage: upstream.mastodon,
  MastodonFeedError: class extends Error {},
}))
beforeEach(() => vi.clearAllMocks())
const connection: Connection = {
  id: 'selected',
  platform: 'twitter',
  origin: 'https://relay.invalid',
  accountId: null,
  displayName: 'Selected',
  status: 'connected',
}
const post = {
  key: 'one',
  platform: 'twitter',
  nativeId: '1',
  url: 'https://x.com/alice/status/1',
  text: 'Evidence',
  author: { name: 'Alice', handle: 'alice' },
}

it.each([
  'twitter',
  'mastodon',
] as const)('discovers %s lists and reuses a returned list in a temporary column', async (platform) => {
  const list = {
    id: '123',
    name: 'Research lists',
    isPrivate: true,
    token: 'private-sentinel',
  }
  upstream.connection.mockResolvedValue('server-relay-profile')
  upstream.reader.mockReturnValue({ internal: 'reader' })
  upstream.twitterLists.mockResolvedValue({ ok: true, lists: [list] })
  upstream.mastodonLists.mockResolvedValue([list])
  const fetchPage = vi.fn().mockResolvedValue({ posts: [] })
  const tools = createResearchTools(
    [{ ...connection, platform }],
    vi.fn(),
    fetchPage,
  )
  const result = await tools.execute('list_lists', {
    connectionId: connection.id,
  })
  expect(result).toEqual({
    ok: true,
    connectionId: connection.id,
    lists: [{ platform, id: '123', name: 'Research lists', isPrivate: true }],
  })
  expect(JSON.stringify(result)).not.toContain('private-sentinel')
  const listed = result as {
    lists: { platform: 'twitter' | 'mastodon'; id: string; name: string }[]
  }
  expect.assert.isDefined(listed.lists[0])
  const returned = listed.lists[0]
  expect(
    await tools.execute('open_temporary_deck', {
      title: returned.name,
      columns: [
        {
          id: 'list-column',
          title: returned.name,
          connectionId: connection.id,
          source: {
            platform: returned.platform,
            kind: 'list',
            target: returned.id,
          },
        },
      ],
    }),
  ).toMatchObject({ ok: true })
  expect(
    await tools.execute('fetch_column_posts', { columnId: 'list-column' }),
  ).toMatchObject({ ok: true })
  expect(fetchPage).toHaveBeenCalledWith(
    expect.objectContaining({
      connectionId: connection.id,
      source: { platform, kind: 'list', target: '123' },
    }),
    undefined,
  )
})

it.each([
  'twitter',
  'mastodon',
] as const)('accepts an empty %s list collection', async (platform) => {
  upstream.twitterLists.mockResolvedValue({ ok: true, lists: [] })
  upstream.mastodonLists.mockResolvedValue([])
  const tools = createResearchTools([{ ...connection, platform }], vi.fn())
  expect(
    await tools.execute('list_lists', { connectionId: connection.id }),
  ).toEqual({ ok: true, connectionId: connection.id, lists: [] })
})

it.each([
  'not-selected',
  'disconnected',
])('rejects list discovery for %s accounts before calling a provider', async (id) => {
  const tools = createResearchTools(
    [{ ...connection, id: 'disconnected', status: 'disconnected' }],
    vi.fn(),
  )
  expect(await tools.execute('list_lists', { connectionId: id })).toMatchObject(
    { ok: false, error: { code: 'account-unavailable' } },
  )
  expect(upstream.connection).not.toHaveBeenCalled()
  expect(upstream.twitterLists).not.toHaveBeenCalled()
  expect(upstream.mastodonLists).not.toHaveBeenCalled()
})

it('preserves list selection metadata and shares the post retrieval budget', async () => {
  upstream.twitterLists.mockResolvedValue({
    ok: true,
    lists: [
      {
        id: '123',
        name: 'Research',
        description: 'Platform engineering',
        memberCount: 0,
      },
    ],
  })
  const tools = createResearchTools([connection], vi.fn())
  expect(
    await tools.execute('list_lists', { connectionId: connection.id }),
  ).toMatchObject({
    ok: true,
    lists: [{ description: 'Platform engineering', memberCount: 0 }],
  })
  await Promise.all(
    Array.from({ length: 11 }, () =>
      tools.execute('list_lists', { connectionId: connection.id }),
    ),
  )
  expect(
    await tools.execute('list_lists', { connectionId: connection.id }),
  ).toMatchObject({ ok: false, error: { code: 'budget-exhausted' } })
  expect(upstream.twitterLists).toHaveBeenCalledTimes(12)
  await tools.execute('open_temporary_deck', {
    title: 'Research',
    columns: [
      {
        id: 'column',
        title: 'List',
        connectionId: connection.id,
        source: { platform: 'twitter', kind: 'list', target: '123' },
      },
    ],
  })
  expect(
    await tools.execute('fetch_column_posts', { columnId: 'column' }),
  ).toMatchObject({ ok: false, error: { code: 'budget-exhausted' } })
  expect(upstream.list).not.toHaveBeenCalled()
})

it('returns a safe domain failure when Twitter list discovery fails', async () => {
  upstream.twitterLists.mockResolvedValue({
    ok: false,
    error: { code: 'rate-limited', message: 'private-sentinel' },
  })
  const tools = createResearchTools([connection], vi.fn())
  const result = await tools.execute('list_lists', {
    connectionId: connection.id,
  })
  expect(result).toMatchObject({ ok: false, error: { code: 'rate-limited' } })
  expect(JSON.stringify(result)).not.toContain('private-sentinel')
})

it('returns a safe failure when Mastodon list discovery throws', async () => {
  upstream.mastodonLists.mockRejectedValue(new Error('private-sentinel'))
  const tools = createResearchTools(
    [{ ...connection, platform: 'mastodon' }],
    vi.fn(),
  )
  const result = await tools.execute('list_lists', {
    connectionId: connection.id,
  })
  expect(result).toMatchObject({
    ok: false,
    error: { code: 'source-unavailable' },
  })
  expect(JSON.stringify(result)).not.toContain('private-sentinel')
})

it.each([
  [{ kind: 'search', query: 'WebMCP' }, 'search'],
  [{ kind: 'user', target: '@alice' }, 'user'],
  [{ kind: 'list', target: '123' }, 'list'],
] as const)('routes Twitter %s through the selected connection and existing page service', async (source, loader) => {
  upstream.connection.mockResolvedValue('server-relay-profile')
  const reader = { internal: 'reader' }
  upstream.reader.mockReturnValue(reader)
  upstream[loader].mockResolvedValue({
    ok: true,
    page: { tweets: [{ id: 'one' }], nextCursor: 'next' },
  })
  upstream.mapPost.mockReturnValue(post)
  const tools = createResearchTools([connection], vi.fn())
  await tools.execute('open_temporary_deck', {
    title: 'Research',
    columns: [
      { id: 'column', title: 'Source', connectionId: connection.id, source },
    ],
  })
  expect(
    await tools.execute('fetch_column_posts', { columnId: 'column' }),
  ).toMatchObject({
    ok: true,
    posts: [{ text: 'Evidence' }],
    nextCursor: 'next',
  })
  expect(upstream.connection).toHaveBeenCalledWith(connection.id)
  expect(upstream.reader).toHaveBeenCalledWith('server-relay-profile')
  expect(upstream[loader]).toHaveBeenCalledWith(
    reader,
    expect.objectContaining({ kind: source.kind, cursor: undefined }),
  )
})

it('routes Mastodon directly through the normalized page service', async () => {
  const source = { platform: 'mastodon', kind: 'hashtag', target: 'WebMCP' }
  upstream.mastodon.mockResolvedValue({
    posts: [{ ...post, platform: 'mastodon' }],
  })
  const tools = createResearchTools(
    [{ ...connection, platform: 'mastodon' }],
    vi.fn(),
  )
  await tools.execute('open_temporary_deck', {
    title: 'Research',
    columns: [
      { id: 'column', title: 'Source', connectionId: connection.id, source },
    ],
  })
  expect(
    await tools.execute('fetch_column_posts', { columnId: 'column' }),
  ).toMatchObject({ ok: true, posts: [{ platform: 'mastodon' }] })
  expect(upstream.mastodon).toHaveBeenCalledWith({
    connectionId: connection.id,
    source,
    cursor: undefined,
  })
})
