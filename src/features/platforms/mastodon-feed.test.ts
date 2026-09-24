// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type AppDatabase, openDatabase } from '../storage/database.server'
import { connections } from '../storage/schema'
import { fetchMastodonPage, nextMastodonCursor } from './mastodon-feed.server'

let database: AppDatabase
vi.mock('../storage/database.server', async (original) => ({
  ...(await original<typeof import('../storage/database.server')>()),
  getDatabase: () => database,
}))
beforeEach(() => {
  database = openDatabase(':memory:')
  database
    .insert(connections)
    .values({
      id: 'account-a',
      platform: 'mastodon',
      origin: 'https://social.invalid',
      accountId: '1',
      displayName: 'A',
      status: 'connected',
      createdAt: 1,
      updatedAt: 1,
    })
    .run()
})
afterEach(() => database.$client.close())
const source = { platform: 'mastodon', kind: 'hashtag', target: '猫' }

describe('Mastodon feed requests', () => {
  it('uses the column connection and numeric continuation without following links', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response('[]', {
        headers: {
          link: '<https://social.invalid/api/v1/timelines/tag/%E7%8C%AB?max_id=100>; rel="next"',
        },
      }),
    )
    const result = await fetchMastodonPage(
      { connectionId: 'account-a', source, cursor: '200' },
      request,
    )
    expect(request).toHaveBeenCalledWith(
      'account-a',
      '/api/v1/timelines/tag/%E7%8C%AB',
      new URLSearchParams({ limit: '20', max_id: '200' }),
    )
    expect(result.nextCursor).toBe('100')
    expect(
      nextMastodonCursor(
        '<https://evil.invalid/api/v1/timelines/tag/cat?max_id=10>; rel="next"',
        'https://social.invalid',
        '/api/v1/timelines/tag/cat',
      ),
    ).toBeUndefined()
  })
  it('resolves remote account handles in the selected instance before reading statuses', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: '42' }))
      .mockResolvedValueOnce(Response.json([]))
    await fetchMastodonPage(
      {
        connectionId: 'account-a',
        source: {
          platform: 'mastodon',
          kind: 'user',
          target: '@alice@elsewhere.invalid',
        },
      },
      request,
    )
    expect(request.mock.calls[0]).toEqual([
      'account-a',
      '/api/v1/accounts/lookup',
      new URLSearchParams({ acct: 'alice@elsewhere.invalid' }),
    ])
    expect(request.mock.calls[1]?.[1]).toBe('/api/v1/accounts/42/statuses')
  })
  it('distinguishes rate limits, expired accounts, and unavailable search', async () => {
    for (const [status, code] of [
      [429, 'rate-limit'],
      [401, 'account-unavailable'],
      [422, 'search-unavailable'],
    ] as const) {
      const request = vi.fn().mockResolvedValue(new Response('{}', { status }))
      await expect(
        fetchMastodonPage(
          {
            connectionId: 'account-a',
            source: { platform: 'mastodon', kind: 'search', query: 'test' },
          },
          request,
        ),
      ).rejects.toMatchObject({ code })
    }
  })
  it('rejects invalid cursors and missing accounts before sending a request', async () => {
    const request = vi.fn()
    await expect(
      fetchMastodonPage(
        { connectionId: 'account-a', source, cursor: 'https://evil.invalid' },
        request,
      ),
    ).rejects.toThrow()
    await expect(
      fetchMastodonPage({ connectionId: 'missing', source }, request),
    ).rejects.toMatchObject({ code: 'account-unavailable' })
    expect(request).not.toHaveBeenCalled()
  })
})
