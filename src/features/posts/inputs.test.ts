import { describe, expect, it } from 'vitest'
import {
  buildSearchQuery,
  normalizeListTarget,
  normalizeTweetId,
  normalizeUserTarget,
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
