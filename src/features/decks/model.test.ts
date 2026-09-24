import { describe, expect, it } from 'vitest'
import { type Deck, deckSchema, moveColumn } from './model'

const deck: Deck = {
  version: 1,
  title: '調査',
  columns: ['a', 'b'].map((id) => ({
    id,
    title: id,
    source: {
      platform: 'twitter',
      query: 'AI lang:ja',
      product: 'Latest',
      following: false,
    },
  })),
}

describe('deck definitions', () => {
  it('preserves native Twitter search conditions when serialized', () => {
    expect(deckSchema.parse(JSON.parse(JSON.stringify(deck)))).toEqual(deck)
  })
  it('rejects duplicate column identities and unsupported platforms', () => {
    expect(
      deckSchema.safeParse({
        ...deck,
        columns: [deck.columns[0], deck.columns[0]],
      }).success,
    ).toBe(false)
    expect(
      deckSchema.safeParse({
        ...deck,
        columns: [
          { ...deck.columns[0], source: { platform: 'nostr', query: 'AI' } },
        ],
      }).success,
    ).toBe(false)
  })
  it('rejects queries that exceed the upstream limit after adding follows', () => {
    expect(
      deckSchema.safeParse({
        ...deck,
        columns: [
          {
            ...deck.columns[0],
            source: {
              platform: 'twitter',
              query: 'a'.repeat(512),
              product: 'Latest',
              following: true,
            },
          },
        ],
      }).success,
    ).toBe(false)
  })
  it('moves a column without changing its query or the previous deck', () => {
    expect(moveColumn(deck, 'b', -1).columns).toEqual([
      deck.columns[1],
      deck.columns[0],
    ])
    expect(deck.columns.map((column) => column.id)).toEqual(['a', 'b'])
    expect(moveColumn(deck, 'a', -1)).toBe(deck)
  })
})
