import { describe, expect, it } from 'vitest'
import { prepareDeck } from './webmcp-contracts'

describe('deck tool input', () => {
  it('fills Twitter defaults and assigns independent IDs to new columns', () => {
    const deck = prepareDeck({
      title: '調査',
      columns: [
        { title: '日本語', source: { query: 'WebMCP lang:ja' } },
        { title: '海外', source: { query: 'WebMCP lang:en' } },
      ],
    })
    expect(deck.columns[0]?.source).toEqual({
      platform: 'twitter',
      query: 'WebMCP lang:ja',
      product: 'Latest',
      following: false,
    })
    expect(new Set(deck.columns.map((column) => column.id)).size).toBe(2)
  })
  it('keeps existing IDs and rejects duplicates before applying a deck', () => {
    const column = { id: 'existing', title: '観点', source: { query: 'AI' } }
    expect(
      prepareDeck({ title: '調査', columns: [column] }).columns[0]?.id,
    ).toBe('existing')
    expect(() =>
      prepareDeck({ title: '調査', columns: [column, column] }),
    ).toThrow()
  })
  it('rejects unsupported platforms, overlong queries and more than six columns', () => {
    expect(() =>
      prepareDeck({
        title: '調査',
        columns: [
          { title: '観点', source: { platform: 'nostr', query: 'AI' } },
        ],
      }),
    ).toThrow()
    expect(() =>
      prepareDeck({
        title: '調査',
        columns: [
          {
            title: '観点',
            source: { query: 'a'.repeat(512), following: true },
          },
        ],
      }),
    ).toThrow()
    expect(() =>
      prepareDeck({
        title: '調査',
        columns: Array.from({ length: 7 }, () => ({
          title: '観点',
          source: { query: 'AI' },
        })),
      }),
    ).toThrow()
  })
})
