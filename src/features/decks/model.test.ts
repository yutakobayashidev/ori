import { describe, expect, it } from 'vitest'
import { type Deck, deckSchema, moveColumn, workspaceSchema } from './model'

const deck: Deck = {
  id: 'research',
  title: '調査',
  columns: ['a', 'b'].map((id) => ({
    id,
    title: id,
    profileName: 'main',
    source: {
      platform: 'twitter',
      kind: 'search',
      query: 'AI lang:ja',
      product: 'Latest',
      following: false,
    },
  })),
}
describe('deck definitions', () => {
  it('preserves native search and the bound relay profile when serialized', () => {
    expect(deckSchema.parse(JSON.parse(JSON.stringify(deck)))).toEqual(deck)
  })
  it('normalizes user and list targets and rejects invalid targets', () => {
    const column = deck.columns[0]
    expect(
      deckSchema.parse({
        ...deck,
        columns: [
          {
            ...column,
            source: { platform: 'twitter', kind: 'user', target: '@alice' },
          },
        ],
      }).columns[0]?.source,
    ).toEqual({ platform: 'twitter', kind: 'user', target: 'alice' })
    expect(
      deckSchema.parse({
        ...deck,
        columns: [
          {
            ...column,
            source: {
              platform: 'twitter',
              kind: 'list',
              target: 'https://x.com/i/lists/123',
            },
          },
        ],
      }).columns[0]?.source,
    ).toEqual({ platform: 'twitter', kind: 'list', target: '123' })
    expect(
      deckSchema.safeParse({
        ...deck,
        columns: [
          {
            ...column,
            source: { platform: 'twitter', kind: 'list', target: 'invalid' },
          },
        ],
      }).success,
    ).toBe(false)
  })
  it('rejects duplicate identities and missing profiles', () => {
    expect(
      deckSchema.safeParse({
        ...deck,
        columns: [deck.columns[0], deck.columns[0]],
      }).success,
    ).toBe(false)
    expect(
      deckSchema.safeParse({
        ...deck,
        columns: [{ ...deck.columns[0], profileName: '' }],
      }).success,
    ).toBe(false)
    expect(
      workspaceSchema.safeParse({
        version: 2,
        activeDeckId: 'missing',
        decks: [deck],
      }).success,
    ).toBe(false)
    expect(
      workspaceSchema.safeParse({
        version: 2,
        activeDeckId: deck.id,
        decks: [deck, deck],
      }).success,
    ).toBe(false)
  })
  it('rejects queries exceeding the upstream limit after adding follows', () => {
    expect(
      deckSchema.safeParse({
        ...deck,
        columns: [
          {
            ...deck.columns[0],
            source: {
              platform: 'twitter',
              kind: 'search',
              query: 'a'.repeat(512),
              product: 'Latest',
              following: true,
            },
          },
        ],
      }).success,
    ).toBe(false)
  })
  it('moves a column without changing its conditions or the previous deck', () => {
    expect(moveColumn(deck, 'b', -1).columns).toEqual([
      deck.columns[1],
      deck.columns[0],
    ])
    expect(deck.columns.map((column) => column.id)).toEqual(['a', 'b'])
    expect(moveColumn(deck, 'a', -1)).toBe(deck)
  })
})
