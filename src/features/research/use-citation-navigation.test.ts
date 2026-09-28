import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { ColumnRegistry } from '../decks/column-tools'
import type { DeckColumn, DeckView, Workspace } from '../decks/model'
import type { ResearchCitation } from './model'
import { useCitationNavigation } from './use-citation-navigation'

const column: DeckColumn = {
  id: 'column',
  title: 'Research',
  connectionId: 'twitter',
  source: {
    platform: 'twitter',
    kind: 'search',
    query: 'WebMCP',
    product: 'Latest',
    following: false,
  },
}
const citation: ResearchCitation = {
  column,
  post: {
    key: 'twitter:123',
    nativeId: '123',
    platform: 'twitter',
    url: 'https://x.com/alice/status/123',
    text: 'Snapshot',
    author: { name: 'Alice', handle: 'alice' },
  },
}
const deck: DeckView = {
  id: 'saved',
  title: 'Saved',
  columns: [column],
  persisted: true,
  revision: 1,
}
function setup(decks: DeckView[], registry: ColumnRegistry = new Map()) {
  const workspace: Workspace = { decks, activeDeckId: decks[0]?.id ?? '' }
  const select = vi.fn()
  const createTemporary = vi.fn(
    (title: string, columns: DeckColumn[]): DeckView => ({
      id: 'created',
      title,
      columns,
      persisted: false,
    }),
  )
  return {
    ...renderHook(() =>
      useCitationNavigation({
        registry,
        getWorkspace: () => workspace,
        select,
        createTemporary,
      }),
    ),
    select,
    createTemporary,
  }
}

it('prefers a live loaded card over its old research snapshot', () => {
  const live = { ...citation.post, text: 'Latest live post' }
  const registry = new Map([
    [
      column.id,
      { current: { column, query: { data: { pages: [{ posts: [live] }] } } } },
    ],
  ]) as ColumnRegistry
  const { result, select, createTemporary } = setup([deck], registry)
  act(() => {
    expect(
      result.current.navigate('https://mobile.twitter.com/alice/status/123', [
        citation,
      ]),
    ).toBe(true)
  })
  expect(result.current.target?.post.text).toBe('Latest live post')
  expect(select).not.toHaveBeenCalled()
  expect(createTemporary).not.toHaveBeenCalled()
})

it('selects another deck with the same source and connection without changing saved data', () => {
  const otherColumn = { ...column, id: 'other-column' }
  const otherDeck = { ...deck, id: 'other', columns: [otherColumn] }
  const { result, select, createTemporary } = setup([
    { ...deck, columns: [] },
    otherDeck,
  ])
  act(() => {
    result.current.navigate(citation.post.url, [citation])
  })
  expect(select).toHaveBeenCalledWith('other')
  expect(result.current.target).toMatchObject({
    deckId: 'other',
    column: otherColumn,
    post: citation.post,
  })
  expect(otherDeck.columns).toEqual([otherColumn])
  expect(createTemporary).not.toHaveBeenCalled()
})

it.each([
  { ...column, connectionId: 'different-account' },
  {
    ...column,
    source: {
      ...column.source,
      kind: 'search' as const,
      platform: 'twitter' as const,
      query: 'Changed',
      product: 'Latest' as const,
      following: false,
    },
  },
])('creates a one-column temporary deck when an old column ID now means another source', (changed) => {
  const { result, createTemporary } = setup([{ ...deck, columns: [changed] }])
  act(() => {
    expect(result.current.navigate(citation.post.url, [citation])).toBe(true)
  })
  expect(createTemporary).toHaveBeenCalledWith('Cited posts', [column])
  expect(result.current.target?.deckId).toBe('created')
})

it('leaves an unknown URL to the normal external link handler', () => {
  const { result, select, createTemporary } = setup([deck])
  act(() => {
    expect(
      result.current.navigate('https://outside.invalid/post', [citation]),
    ).toBe(false)
  })
  expect(result.current.target).toBeUndefined()
  expect(select).not.toHaveBeenCalled()
  expect(createTemporary).not.toHaveBeenCalled()
})
