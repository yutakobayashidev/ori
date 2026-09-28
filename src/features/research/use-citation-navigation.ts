import { useState } from 'react'
import type { ColumnRegistry } from '../decks/column-tools'
import type { DeckColumn, DeckView, Workspace } from '../decks/model'
import { flattenResearchPages } from '../platforms/use-research-feed'
import { citationUrlKey } from './citation-url'
import type { ResearchCitation } from './model'
import './citation-navigation.css'

export function sameCitationSource(left: DeckColumn, right: DeckColumn) {
  const sourceKey = (column: DeckColumn) =>
    JSON.stringify(
      Object.entries(column.source).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    )
  return (
    left.connectionId === right.connectionId &&
    sourceKey(left) === sourceKey(right)
  )
}

export type CitationTarget = ResearchCitation & {
  deckId: string
  request: number
}

export function useCitationNavigation({
  registry,
  getWorkspace,
  select,
  createTemporary,
}: {
  registry: ColumnRegistry
  getWorkspace: () => Workspace
  select: (id: string) => unknown
  createTemporary: (title: string, columns: DeckColumn[]) => DeckView
}) {
  const [target, setTarget] = useState<CitationTarget>()
  function navigate(url: string, citations: ResearchCitation[]): boolean {
    const key = citationUrlKey(url)
    if (!key) return false
    const workspace = getWorkspace()
    const active = workspace.decks.find(
      (deck) => deck.id === workspace.activeDeckId,
    )
    // Prefer a live card already visible in the active deck over an older snapshot.
    for (const column of active?.columns ?? []) {
      const feed = registry.get(column.id)?.current
      if (!feed || !sameCitationSource(feed.column, column)) continue
      const post = flattenResearchPages(feed.query.data?.pages ?? []).find(
        (post) => citationUrlKey(post.url) === key,
      )
      if (post && active) {
        setTarget((previous) => ({
          deckId: active.id,
          column,
          post,
          request: (previous?.request ?? 0) + 1,
        }))
        return true
      }
    }
    const citation = citations.find(
      (entry) => citationUrlKey(entry.post.url) === key,
    )
    if (!citation) return false
    const candidates = [...workspace.decks].sort(
      (left, right) =>
        Number(right.id === workspace.activeDeckId) -
        Number(left.id === workspace.activeDeckId),
    )
    for (const deck of candidates) {
      const column = deck.columns.find((column) =>
        sameCitationSource(column, citation.column),
      )
      if (!column) continue
      select(deck.id)
      setTarget((previous) => ({
        ...citation,
        column,
        deckId: deck.id,
        request: (previous?.request ?? 0) + 1,
      }))
      return true
    }
    const deck = createTemporary('Cited posts', [citation.column])
    setTarget((previous) => ({
      ...citation,
      deckId: deck.id,
      request: (previous?.request ?? 0) + 1,
    }))
    return true
  }
  return { target, navigate }
}
