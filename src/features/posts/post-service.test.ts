import { describe, expect, it, vi } from 'vitest'
import {
  type BirdReader,
  loadListChoices,
  loadListPage,
  loadUserPage,
  searchPage,
} from './post-service'

const reader = (): BirdReader => ({
  getLists: vi.fn().mockResolvedValue({
    success: true,
    lists: [
      {
        id: '1234567890',
        name: 'My List',
        description: 'Useful accounts',
        memberCount: 10,
        subscriberCount: 4,
        isPrivate: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        owner: { id: '42', username: 'private', name: 'Private' },
      },
    ],
  }),
  getUserIdByUsername: vi
    .fn()
    .mockResolvedValue({ success: true, userId: '42' }),
  getUserTweetsPaged: vi.fn().mockResolvedValue({
    success: true,
    tweets: [
      { id: '1', text: 'hello', author: { username: 'yuta', name: 'Yuta' } },
    ],
    nextCursor: 'user-next',
  }),
  getAllSearchResults: vi.fn().mockResolvedValue({
    success: true,
    tweets: [],
    nextCursor: 'search-next',
  }),
  getAllListTimeline: vi.fn().mockResolvedValue({
    success: true,
    tweets: [
      { id: '7', text: 'listed', author: { username: 'bird', name: 'Bird' } },
    ],
    nextCursor: 'list-next',
  }),
})

describe('loadListChoices', () => {
  it('returns only the fields needed by the list picker', async () => {
    const client = reader()

    expect(await loadListChoices(client)).toEqual({
      ok: true,
      lists: [
        {
          id: '1234567890',
          name: 'My List',
          description: 'Useful accounts',
          memberCount: 10,
          isPrivate: true,
        },
      ],
    })
    expect(client.getLists).toHaveBeenCalledWith(100)
  })

  it('returns a safe retryable error without leaking Bird details', async () => {
    const client = reader()
    vi.mocked(client.getLists).mockResolvedValue({
      success: false,
      error: 'PRIVATE_LIST_DIAGNOSTIC',
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const result = await loadListChoices(client)

      expect(result).toEqual({
        ok: false,
        error: {
          code: 'upstream',
          message: 'X から投稿を取得できませんでした。',
          retryable: true,
        },
      })
      expect(JSON.stringify(result)).not.toContain('PRIVATE_LIST_DIAGNOSTIC')
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('loadUserPage', () => {
  it('resolves a handle and fetches exactly one page', async () => {
    const client = reader()
    const result = await loadUserPage(client, {
      target: 'https://x.com/yuta',
      cursor: 'cursor-1',
    })

    expect(client.getUserIdByUsername).toHaveBeenCalledWith('yuta')
    expect(client.getUserTweetsPaged).toHaveBeenCalledWith('42', 20, {
      cursor: 'cursor-1',
      maxPages: 1,
      pageDelayMs: 0,
    })
    expect(result).toMatchObject({
      ok: true,
      page: { nextCursor: 'user-next' },
    })
  })

  it('returns a safe not-found error', async () => {
    const client = reader()
    vi.mocked(client.getUserIdByUsername).mockResolvedValue({
      success: false,
      error: 'User not found: private relay detail',
    })

    expect(await loadUserPage(client, { target: 'missing' })).toEqual({
      ok: false,
      error: {
        code: 'user-not-found',
        message: 'ユーザーが見つかりませんでした。',
        retryable: false,
      },
    })
  })
})

describe('loadListPage', () => {
  it('resolves a list URL and fetches exactly one page', async () => {
    const client = reader()
    const result = await loadListPage(client, {
      target: 'https://x.com/i/lists/1234567890',
      cursor: 'cursor-1',
    })

    expect(client.getAllListTimeline).toHaveBeenCalledWith('1234567890', {
      cursor: 'cursor-1',
      maxPages: 1,
    })
    expect(result).toEqual({
      ok: true,
      page: {
        tweets: [
          {
            id: '7',
            text: 'listed',
            author: { username: 'bird', name: 'Bird' },
          },
        ],
        nextCursor: 'list-next',
      },
    })
  })

  it('rejects an invalid target without a Bird call', async () => {
    const client = reader()

    expect(await loadListPage(client, { target: 'not-a-list' })).toEqual({
      ok: false,
      error: {
        code: 'invalid-input',
        message: 'リスト ID は数字で入力してください。',
        retryable: false,
      },
    })
    expect(client.getAllListTimeline).not.toHaveBeenCalled()
  })

  it('returns a safe not-found error', async () => {
    const client = reader()
    vi.mocked(client.getAllListTimeline).mockResolvedValue({
      success: false,
      error: 'List not found: private relay detail',
    })

    expect(await loadListPage(client, { target: '1234567890' })).toEqual({
      ok: false,
      error: {
        code: 'list-not-found',
        message: 'リストが見つかりませんでした。',
        retryable: false,
      },
    })
  })

  it('returns a safe unavailable error for a protected list', async () => {
    const client = reader()
    vi.mocked(client.getAllListTimeline).mockResolvedValue({
      success: false,
      error: 'List is protected: private relay detail',
    })

    expect(await loadListPage(client, { target: '1234567890' })).toEqual({
      ok: false,
      error: {
        code: 'list-unavailable',
        message: 'このリストは取得できません。',
        retryable: false,
      },
    })
  })

  it('removes raw response data from posts', async () => {
    const client = reader()
    vi.mocked(client.getAllListTimeline).mockResolvedValue({
      success: true,
      tweets: [
        {
          id: '7',
          text: 'listed',
          author: { username: 'bird', name: 'Bird' },
          _raw: { rest_id: 'private-list-detail' },
        },
      ],
    })

    const result = await loadListPage(client, { target: '1234567890' })

    expect(JSON.stringify(result)).not.toContain('private-')
  })
})

describe('searchPage', () => {
  it('forwards Top and appends follows once', async () => {
    const client = reader()
    await searchPage(client, {
      query: 'AI lang:ja',
      product: 'Top',
      following: true,
      cursor: 'cursor-2',
    })

    expect(client.getAllSearchResults).toHaveBeenCalledWith(
      'AI lang:ja filter:follows',
      { product: 'Top', cursor: 'cursor-2', maxPages: 1 },
    )
  })

  it('removes raw response data from posts and quoted posts', async () => {
    const client = reader()
    vi.mocked(client.getAllSearchResults).mockResolvedValue({
      success: true,
      tweets: [
        {
          id: '1',
          text: 'hello',
          author: { username: 'yuta', name: 'Yuta' },
          quotedTweet: {
            id: '2',
            text: 'quoted',
            author: { username: 'bird', name: 'Bird' },
            _raw: { rest_id: 'private-quoted-detail' },
          },
          _raw: { rest_id: 'private-detail' },
        },
      ],
    })

    const result = await searchPage(client, {
      query: 'AI',
      product: 'Latest',
      following: false,
    })

    expect(result).toEqual({
      ok: true,
      page: {
        nextCursor: undefined,
        tweets: [
          {
            id: '1',
            text: 'hello',
            author: { username: 'yuta', name: 'Yuta' },
            quotedTweet: {
              id: '2',
              text: 'quoted',
              author: { username: 'bird', name: 'Bird' },
            },
          },
        ],
      },
    })
  })

  it('logs unexpected details without returning them', async () => {
    const client = reader()
    const privateDetail = 'TASK4_PRIVATE_RELAY_MARKER_9e0b'
    const upstreamError = new Error(privateDetail)
    vi.mocked(client.getAllSearchResults).mockRejectedValue(upstreamError)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const result = await searchPage(client, {
        query: 'AI',
        product: 'Latest',
        following: false,
      })

      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledWith(
        'Unexpected Bird failure:',
        upstreamError,
      )
      expect(result).toEqual({
        ok: false,
        error: {
          code: 'upstream',
          message: 'X から投稿を取得できませんでした。',
          retryable: true,
        },
      })
      expect(JSON.stringify(result)).not.toContain(privateDetail)
    } finally {
      errorSpy.mockRestore()
    }
  })
})
