import { describe, expect, it } from 'vitest'
import {
  buildAdvancedSearchQuery,
  buildFilteredSearchQuery,
  buildSearchQuery,
  normalizeListTarget,
  normalizeTweetId,
  normalizeUserTarget,
  postSearchRouteSchema,
  threadPageInputSchema,
} from './inputs'

describe('threadPageInputSchema', () => {
  it('accepts initial and complete continuation requests', () => {
    expect(threadPageInputSchema.parse({ tweetId: '123' })).toEqual({
      tweetId: '123',
    })
    expect(
      threadPageInputSchema.parse({
        tweetId: '123',
        conversationId: '100',
        cursor: 'thread-next',
      }),
    ).toEqual({
      tweetId: '123',
      conversationId: '100',
      cursor: 'thread-next',
    })
  })

  it.each([
    { tweetId: '' },
    { tweetId: 'abc' },
    { tweetId: '123', cursor: 'thread-next' },
    { tweetId: '123', conversationId: '100' },
    { tweetId: '123', conversationId: 'root', cursor: 'thread-next' },
  ])('rejects an invalid thread request %#', (input) => {
    expect(() => threadPageInputSchema.parse(input)).toThrow()
  })
})

describe('normalizeTweetId', () => {
  it('keeps a decimal post ID', () => {
    expect(normalizeTweetId(' 1234567890 ')).toBe('1234567890')
  })

  it.each(['', '123/status', '@123', '１２３'])('rejects %s', (input) => {
    expect(() => normalizeTweetId(input)).toThrow(
      '投稿 ID を確認してください。',
    )
  })
})

describe('normalizeUserTarget', () => {
  it.each([
    ['@tan_stack', 'tan_stack'],
    ['tan_stack', 'tan_stack'],
    ['https://x.com/tan_stack', 'tan_stack'],
    ['https://twitter.com/tan_stack/', 'tan_stack'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeUserTarget(input)).toBe(expected)
  })

  it.each([
    '',
    'not valid',
    'https://example.com/tan_stack',
    'https://x.com/tan_stack/status/1',
  ])('rejects %s', (input) => {
    expect(() => normalizeUserTarget(input)).toThrow()
  })
})

describe('normalizeListTarget', () => {
  it.each([
    ['1234567890', '1234567890'],
    [' https://x.com/i/lists/1234567890 ', '1234567890'],
    ['https://twitter.com/i/lists/1234567890/', '1234567890'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeListTarget(input)).toBe(expected)
  })

  it.each([
    '',
    'not-a-list',
    '１２３４５',
    'https://example.com/i/lists/1234567890',
    'https://x.com/tan_stack/lists',
    'https://x.com/i/lists/1234567890/members',
    'https://x.com/i/lists/not-a-list',
  ])('rejects %s', (input) => {
    expect(() => normalizeListTarget(input)).toThrow()
  })
})

describe('buildSearchQuery', () => {
  it('keeps a deliberate query unchanged', () => {
    expect(buildSearchQuery('  AI lang:ja  ', false)).toBe('AI lang:ja')
  })

  it('adds the follows operator once', () => {
    expect(buildSearchQuery('AI lang:ja', true)).toBe(
      'AI lang:ja filter:follows',
    )
    expect(buildSearchQuery('AI filter:follows', true)).toBe(
      'AI filter:follows',
    )
  })

  it('rejects an empty query', () => {
    expect(() => buildSearchQuery('   ', false)).toThrow()
  })
})

describe('buildAdvancedSearchQuery', () => {
  it('builds a query from button-friendly filters', () => {
    expect(
      buildAdvancedSearchQuery({
        q: 'TypeScript',
        from: '@tan_stack',
        since: '2026-08-04',
        until: '2026-08-11',
        lang: 'ja',
        content: 'images',
        excludeReplies: true,
        excludeReposts: true,
      }),
    ).toBe(
      'TypeScript from:tan_stack since:2026-08-04 until:2026-08-11 lang:ja filter:images -filter:replies -filter:retweets',
    )
  })

  it('allows an author search without keywords', () => {
    expect(
      buildAdvancedSearchQuery({
        q: '',
        from: 'tan_stack',
        since: '',
        until: '',
        lang: 'all',
        content: 'all',
        excludeReplies: false,
        excludeReposts: false,
      }),
    ).toBe('from:tan_stack')
  })

  it('rejects filters that have no keyword or author', () => {
    expect(() =>
      buildAdvancedSearchQuery({
        q: '',
        from: '',
        since: '2026-08-04',
        until: '',
        lang: 'ja',
        content: 'all',
        excludeReplies: false,
        excludeReposts: false,
      }),
    ).toThrow('検索語または投稿者を入力してください。')
  })

  it('rejects an invalid author and reversed dates', () => {
    const base = {
      q: 'TypeScript',
      from: '',
      since: '',
      until: '',
      lang: 'all' as const,
      content: 'all' as const,
      excludeReplies: false,
      excludeReposts: false,
    }

    expect(() =>
      buildAdvancedSearchQuery({ ...base, from: 'not-valid!' }),
    ).toThrow('投稿者のハンドルを確認してください。')
    expect(() =>
      buildAdvancedSearchQuery({
        ...base,
        since: '2026-08-11',
        until: '2026-08-10',
      }),
    ).toThrow('終了日は開始日より後の日付を選んでください。')
  })

  it('rejects nonexistent dates and a compiled query over 512 characters', () => {
    const base = {
      q: 'TypeScript',
      from: '',
      since: '',
      until: '',
      lang: 'all' as const,
      content: 'all' as const,
      excludeReplies: false,
      excludeReposts: false,
    }

    expect(() =>
      buildAdvancedSearchQuery({ ...base, since: '2026-02-30' }),
    ).toThrow('開始日を確認してください。')
    expect(() =>
      buildAdvancedSearchQuery({ ...base, q: 'a'.repeat(510), lang: 'ja' }),
    ).toThrow('検索語は 512 文字以内で入力してください。')
  })
})

describe('buildFilteredSearchQuery', () => {
  it('includes the follows filter in the final query and enforces its length', () => {
    const input = {
      q: 'TypeScript',
      from: '',
      since: '',
      until: '',
      lang: 'ja' as const,
      content: 'all' as const,
      excludeReplies: false,
      excludeReposts: false,
    }

    expect(buildFilteredSearchQuery(input, true)).toBe(
      'TypeScript lang:ja filter:follows',
    )
    expect(() =>
      buildFilteredSearchQuery({ ...input, q: 'a'.repeat(498) }, true),
    ).toThrow('検索語は 512 文字以内で入力してください。')
  })
})

describe('postSearchRouteSchema', () => {
  it('keeps omitted filter parameters optional', () => {
    expect(
      postSearchRouteSchema.parse({
        q: 'AI',
        product: 'Latest',
        following: false,
      }),
    ).toEqual({
      q: 'AI',
      product: 'Latest',
      following: false,
    })
  })
})
