import { useWebMCP } from 'usewebmcp'
import type { Deck, Workspace } from './model'
import { useWebMCPSupported } from './use-webmcp-supported'
import {
  deckIdInput,
  emptyToolInput,
  getDeckInput,
  prepareDeck,
  setDeckInput,
  toolResult,
} from './webmcp-contracts'

export function useDeckTools({
  ready,
  storageError,
  save,
  select,
  remove,
  getWorkspace,
  profiles,
  onApplied,
}: {
  ready: boolean
  storageError?: string
  save: (deck: Deck) => boolean
  select: (id: string) => boolean
  remove: (id: string) => boolean
  getWorkspace: () => Workspace
  profiles: string[] | undefined
  onApplied: () => void
}) {
  const supported = useWebMCPSupported()
  const enabled = supported && ready
  function applied(persisted: boolean) {
    onApplied()
    if (!persisted)
      throw new Error(
        'The deck was applied in this tab but could not be saved. Reloading will lose these changes.',
      )
  }
  useWebMCP({
    name: 'list_decks',
    description:
      'List saved decks and their columns, activeDeckId and available relay profile names. Conditions are stored in this browser only; posts are not included.',
    inputSchema: emptyToolInput,
    enabled,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) =>
      toolResult(() => {
        emptyToolInput.parse(input)
        const workspace = getWorkspace()
        return {
          decks: workspace.decks,
          activeDeckId: workspace.activeDeckId,
          profiles: profiles ?? null,
          storageError: storageError ?? null,
        }
      }),
  })
  useWebMCP({
    name: 'get_deck',
    description:
      'Read one saved deck with column IDs, bound relay profiles and source definitions. Omit deckId for the active deck. No post fetch.',
    inputSchema: getDeckInput,
    enabled,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) =>
      toolResult(() => {
        const { deckId } = getDeckInput.parse(input)
        const workspace = getWorkspace()
        const deck = workspace.decks.find(
          (deck) => deck.id === (deckId ?? workspace.activeDeckId),
        )
        if (!deck) throw new Error('Deck not found.')
        return { deck, storageError: storageError ?? null }
      }),
  })
  useWebMCP({
    name: 'set_deck',
    description:
      'Create a saved deck when deckId is omitted, or replace an existing deck by ID, then activate it. Up to six ordered columns: search, user timeline or list, each with an explicit relay profile from list_decks. Omitted columns are removed. Closes unsaved forms. Posts load asynchronously and can fail independently.',
    inputSchema: setDeckInput,
    enabled,
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) =>
      toolResult(() => {
        const parsed = setDeckInput.parse(input)
        if (
          parsed.deckId &&
          !getWorkspace().decks.some((deck) => deck.id === parsed.deckId)
        )
          throw new Error('Deck not found.')
        if (!profiles) throw new Error('Relay profiles are not available yet.')
        const next = prepareDeck(parsed, profiles)
        applied(save(next))
        return { deck: next, persisted: true, posts: 'loading-asynchronously' }
      }),
  })
  useWebMCP({
    name: 'select_deck',
    description:
      'Activate a saved deck by ID and save the selection in this browser. Closes unsaved forms; its columns load asynchronously.',
    inputSchema: deckIdInput,
    enabled,
    annotations: { readOnlyHint: false },
    execute: (input) =>
      toolResult(() => {
        const { deckId } = deckIdInput.parse(input)
        applied(select(deckId))
        const workspace = getWorkspace()
        return {
          decks: workspace.decks,
          activeDeckId: workspace.activeDeckId,
          persisted: true,
        }
      }),
  })
  useWebMCP({
    name: 'delete_deck',
    description:
      'Permanently delete one saved deck and its column definitions from this browser. The last remaining deck cannot be deleted. Deleting the active deck selects the first remaining deck.',
    inputSchema: deckIdInput,
    enabled,
    annotations: { readOnlyHint: false, destructiveHint: true },
    execute: (input) =>
      toolResult(() => {
        const { deckId } = deckIdInput.parse(input)
        applied(remove(deckId))
        const workspace = getWorkspace()
        return {
          decks: workspace.decks,
          activeDeckId: workspace.activeDeckId,
          persisted: true,
        }
      }),
  })
}
