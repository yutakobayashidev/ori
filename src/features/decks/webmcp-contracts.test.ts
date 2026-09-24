import { describe, expect, it } from 'vitest'
import { prepareDeck } from './webmcp-contracts'

const column = {
  title: '観点',
  profileName: 'main',
  source: { kind: 'search', query: 'AI' },
}
describe('deck tool input', () => {
  it('fills Twitter defaults and assigns independent deck and column IDs', () => {
    const deck = prepareDeck({ title: '調査', columns: [column, column] }, [
      'main',
    ])
    expect(deck.columns[0]?.source).toEqual({
      platform: 'twitter',
      kind: 'search',
      query: 'AI',
      product: 'Latest',
      following: false,
    })
    expect(
      new Set([deck.id, ...deck.columns.map((column) => column.id)]).size,
    ).toBe(3)
  })
  it('keeps supplied identities and rejects duplicates', () => {
    const identified = { ...column, id: 'existing' }
    expect(
      prepareDeck(
        { deckId: 'research', title: '調査', columns: [identified] },
        ['main'],
      ),
    ).toMatchObject({ id: 'research', columns: [{ id: 'existing' }] })
    expect(() =>
      prepareDeck({ title: '調査', columns: [identified, identified] }, [
        'main',
      ]),
    ).toThrow()
  })
  it('rejects unavailable profiles before applying a definition', () => {
    expect(() =>
      prepareDeck({ title: '調査', columns: [column] }, ['work']),
    ).toThrow('Unknown relay profile')
  })
  it('accepts user and list columns bound to separate profiles', () => {
    const deck = prepareDeck(
      {
        title: '調査',
        columns: [
          { ...column, source: { kind: 'user', target: '@alice' } },
          {
            ...column,
            profileName: 'work',
            source: { kind: 'list', target: '123' },
          },
        ],
      },
      ['main', 'work'],
    )
    expect(deck.columns.map((column) => column.profileName)).toEqual([
      'main',
      'work',
    ])
    expect(deck.columns.map((column) => column.source.kind)).toEqual([
      'user',
      'list',
    ])
  })
  it('rejects unsupported platforms, overlong queries and more than six columns', () => {
    expect(() =>
      prepareDeck(
        {
          title: '調査',
          columns: [
            {
              ...column,
              source: { kind: 'search', platform: 'nostr', query: 'AI' },
            },
          ],
        },
        ['main'],
      ),
    ).toThrow()
    expect(() =>
      prepareDeck(
        {
          title: '調査',
          columns: [
            {
              ...column,
              source: {
                kind: 'search',
                query: 'a'.repeat(512),
                following: true,
              },
            },
          ],
        },
        ['main'],
      ),
    ).toThrow()
    expect(() =>
      prepareDeck(
        { title: '調査', columns: Array.from({ length: 7 }, () => column) },
        ['main'],
      ),
    ).toThrow()
  })
})
