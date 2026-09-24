import { describe, expect, it } from 'vitest'
import {
  buildSearchQuery,
  listChoicesInputSchema,
  listPageInputSchema,
  normalizeListTarget,
  normalizeUserTarget,
  searchPageInputSchema,
  userPageInputSchema,
} from './inputs'

describe('explicit relay profile binding', () => {
  it.each([
    [
      searchPageInputSchema,
      { query: 'AI', product: 'Latest', following: false },
    ],
    [listPageInputSchema, { target: '123' }],
    [userPageInputSchema, { target: 'yuta' }],
    [listChoicesInputSchema, {}],
  ])('rejects missing or empty bindings for loader %#', (schema, input) => {
    expect(schema.safeParse(input).success).toBe(false)
    expect(schema.safeParse({ ...input, profileName: ' ' }).success).toBe(false)
    expect(schema.safeParse({ ...input, profileName: 'work' }).success).toBe(
      true,
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
