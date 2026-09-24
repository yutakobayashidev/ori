import { describe, expect, it } from 'vitest'
import type { Post, ThreadPage } from './types'
import { type FeedRequest, PostLoadError } from './use-post-feed'
import {
  feedResult,
  prepareSearch,
  readToolInput,
  toolResult,
} from './webmcp-contracts'

const post = (id: string): Post => ({
  id,
  text: `Post ${id}`,
  author: { username: 'reader', name: 'Reader' },
})

const request = { kind: 'user', target: 'reader' } satisfies FeedRequest

describe('WebMCP search input', () => {
  it('defaults to chronological search without adding filters', () => {
    expect(prepareSearch({ q: '  hello  ' })).toMatchObject({
      search: { q: 'hello', product: 'Latest', following: false },
      request: {
        kind: 'search',
        query: 'hello',
        product: 'Latest',
        following: false,
      },
    })
  })

  it('compiles the same author, date, content, and exclusion filters as the UI', () => {
    expect(
      prepareSearch({
        q: 'release',
        from: '@reader',
        since: '2026-09-01',
        until: '2026-09-24',
        lang: 'ja',
        content: 'links',
        excludeReplies: true,
        excludeReposts: true,
        product: 'Top',
        following: true,
      }).request,
    ).toEqual({
      kind: 'search',
      query:
        'release from:reader since:2026-09-01 until:2026-09-24 lang:ja filter:links -filter:replies -filter:retweets filter:follows',
      product: 'Top',
      following: true,
    })
  })

  it('accepts an author as the deliberate search intent', () => {
    expect(prepareSearch({ from: 'reader' }).request.query).toBe('from:reader')
  })

  it.each([
    ['an impossible date', { q: 'hello', since: '2026-02-30' }],
    ['an invalid date format', { q: 'hello', until: 'yesterday' }],
    [
      'an inverted period',
      { q: 'hello', since: '2026-09-24', until: '2026-09-01' },
    ],
    [
      'an empty period',
      { q: 'hello', since: '2026-09-24', until: '2026-09-24' },
    ],
    ['missing search intent', {}],
    ['whitespace-only intent', { q: '   ', from: '  ' }],
    ['an unrecognized property', { q: 'hello', profile: 'other' }],
  ])('rejects %s', (_description, input) => {
    expect(() => prepareSearch(input)).toThrow()
  })
})

describe('WebMCP read input', () => {
  it('defaults to the first 20 loaded posts', () => {
    expect(readToolInput.parse({})).toEqual({ offset: 0, limit: 20 })
  })

  it('accepts the maximum batch size', () => {
    expect(readToolInput.parse({ offset: 10, limit: 50 })).toEqual({
      offset: 10,
      limit: 50,
    })
  })

  it.each([
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { limit: '20' },
    { offset: -1 },
    { offset: 0.5 },
    { cursor: 'upstream-cursor' },
  ])('rejects invalid pagination %j', (input) => {
    expect(readToolInput.safeParse(input).success).toBe(false)
  })
})

describe('WebMCP feed output', () => {
  it('bounds post text and indicates when text was truncated', () => {
    const result = feedResult(request, [
      {
        tweets: [
          { ...post('1'), text: 'a'.repeat(2001) },
          { ...post('2'), text: 'b'.repeat(2000) },
        ],
      },
    ])

    expect(result.posts).toEqual([
      {
        id: '1',
        author: { username: 'reader', name: 'Reader' },
        text: 'a'.repeat(2000),
        textTruncated: true,
        createdAt: undefined,
        url: 'https://x.com/reader/status/1',
      },
      {
        id: '2',
        author: { username: 'reader', name: 'Reader' },
        text: 'b'.repeat(2000),
        textTruncated: false,
        createdAt: undefined,
        url: 'https://x.com/reader/status/2',
      },
    ])
  })

  it('deduplicates loaded pages before applying the requested offset and limit', () => {
    const result = feedResult(
      request,
      [
        { tweets: [post('1'), post('2')], nextCursor: 'next' },
        { tweets: [post('2'), post('3'), post('4')] },
      ],
      1,
      2,
    )

    expect(result.posts.map(({ id }) => id)).toEqual(['2', '3'])
    expect(result).toMatchObject({
      loadedCount: 4,
      offset: 1,
      nextOffset: 3,
      hasMore: false,
    })
  })

  it('includes the focal post once before the deduplicated conversation', () => {
    const focal = post('2')
    const pages: ThreadPage[] = [
      {
        focalPost: focal,
        conversationId: '1',
        tweets: [post('1'), focal],
        nextCursor: 'next',
      },
      { conversationId: '1', tweets: [focal, post('3'), post('1')] },
    ]

    const result = feedResult({ kind: 'thread', tweetId: '2' }, pages)

    expect(result.posts.map(({ id }) => id)).toEqual(['2', '1', '3'])
    expect(result.loadedCount).toBe(3)
  })

  it('reports upstream continuation separately from remaining loaded posts', () => {
    const result = feedResult(request, [
      { tweets: [post('1')], nextCursor: 'more-on-server' },
    ])

    expect(result).toMatchObject({
      loadedCount: 1,
      nextOffset: null,
      hasMore: true,
    })
  })

  it('returns an empty batch when the offset is beyond the loaded posts', () => {
    expect(
      feedResult(request, [{ tweets: [post('1')] }], 10, 20),
    ).toMatchObject({
      posts: [],
      loadedCount: 1,
      offset: 10,
      nextOffset: null,
      hasMore: false,
    })
  })
})

describe('WebMCP execution result', () => {
  it.each([
    true,
    false,
  ])('preserves a load failure with retryable=%s', async (retryable) => {
    const detail = {
      code: 'upstream' as const,
      message: 'Relay unavailable',
      retryable,
    }

    const result = await toolResult(() =>
      Promise.reject(new PostLoadError(detail)),
    )

    expect(result).toEqual({
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(detail) }],
    })
  })

  it('returns invalid-input for schema validation failures', async () => {
    const result = await toolResult(() => readToolInput.parse({ limit: 100 }))

    expect(result).toMatchObject({ isError: true })
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      code: 'invalid-input',
      retryable: false,
    })
  })

  it('keeps successful empty results distinguishable from failures', async () => {
    const result = await toolResult(() => feedResult(request, [{ tweets: [] }]))

    expect(result).not.toHaveProperty('isError')
    expect(JSON.parse(result.content[0].text)).toEqual({
      request,
      posts: [],
      loadedCount: 0,
      offset: 0,
      nextOffset: null,
      hasMore: false,
    })
  })
})
