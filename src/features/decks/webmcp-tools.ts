import { useRef } from 'react'
import { useWebMCP } from 'usewebmcp'
import { emptyToolInput, toolResult } from '#/features/posts/webmcp-contracts'
import { useWebMCPSupported } from '#/features/posts/webmcp-tools'
import type { Deck } from './model'
import { prepareDeck, setDeckInput } from './webmcp-contracts'

export function useDeckTools({
  deck,
  ready,
  storageError,
  save,
  onApplied,
}: {
  deck: Deck
  ready: boolean
  storageError?: string
  save: (deck: Deck) => boolean
  onApplied: () => void
}) {
  const supported = useWebMCPSupported()
  const current = useRef({ deck, storageError })
  current.current = { deck, storageError }

  useWebMCP({
    name: 'get_deck',
    description:
      'Read the current research deck: title and ordered columns with IDs and native Twitter search conditions. No post fetch. Use this before editing with set_deck. Available on /deck only.',
    inputSchema: emptyToolInput,
    enabled: supported && ready,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) =>
      toolResult(() => {
        emptyToolInput.parse(input)
        return {
          deck: current.current.deck,
          storageError: current.current.storageError ?? null,
        }
      }),
  })

  useWebMCP({
    name: 'set_deck',
    description:
      'Create or replace the entire visible research deck and save its conditions in this browser. Supply a title and up to six ordered Twitter search columns. Keep existing column IDs to edit them; omitted columns are removed. Closes unsaved editor forms. Only Twitter is connected. Returns the applied definition immediately; posts load asynchronously and may fail independently. Available on /deck only.',
    inputSchema: setDeckInput,
    enabled: supported && ready,
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) =>
      toolResult(() => {
        // Validate the whole definition before modifying either storage or UI.
        const next = prepareDeck(input)
        const persisted = save(next)
        onApplied()
        const error = persisted
          ? undefined
          : 'The deck was applied in this tab but could not be saved. Reloading will lose these changes.'
        current.current = { deck: next, storageError: error }
        if (error) throw new Error(error)
        return { deck: next, persisted: true, posts: 'loading-asynchronously' }
      }),
  })
}
