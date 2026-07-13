import { describe, expect, it, vi } from 'vitest'
import { type BirdReader, loadUserPage, searchPage } from './post-service'

const reader = (): BirdReader => ({
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
