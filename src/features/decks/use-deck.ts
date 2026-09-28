import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LEGACY_STORAGE_KEY, legacyWorkspaceSchema } from './legacy-import'
import {
  type Deck,
  type DeckView,
  deckSchema,
  EMPTY_DECK,
  EMPTY_WORKSPACE,
  newId,
  type Workspace,
} from './model'
import type { SavedDeck } from './persistence-model'
import {
  createSavedDeck,
  deleteSavedDeck,
  importBrowserDecks,
  loadSavedDecks,
  replaceSavedDeck,
} from './server-functions'

export const ACTIVE_DECK_KEY = 'twitter-lite-active-deck'
function asView(deck: SavedDeck): DeckView {
  return {
    id: deck.id,
    title: deck.title,
    columns: deck.columns,
    revision: deck.revision,
    persisted: true,
  }
}
function definition(deck: Deck): Deck {
  return deckSchema.parse({
    id: deck.id,
    title: deck.title,
    columns: deck.columns,
  })
}

export function useDeck(editing = false) {
  const services = {
    load: useServerFn(loadSavedDecks),
    create: useServerFn(createSavedDeck),
    replace: useServerFn(replaceSavedDeck),
    remove: useServerFn(deleteSavedDeck),
    import: useServerFn(importBrowserDecks),
  }
  const servicesRef = useRef(services)
  servicesRef.current = services
  const editingRef = useRef(editing)
  editingRef.current = editing
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY_WORKSPACE)
  const current = useRef(workspace)
  const [ready, setReady] = useState(false)
  const initialized = useRef(false)
  const [storageError, setStorageError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const generation = useRef(0)
  const refreshSequence = useRef(0)
  const [legacyAvailable, setLegacyAvailable] = useState(false)

  const apply = useCallback((next: Workspace) => {
    current.current = next
    setWorkspace(next)
    try {
      localStorage.setItem(ACTIVE_DECK_KEY, next.activeDeckId)
    } catch {
      /* Selection is a device-local preference, not saved deck data. */
    }
  }, [])
  const reconcile = useCallback(
    (saved: SavedDeck[]) => {
      let preferred = current.current.activeDeckId
      let temporary = current.current.decks.filter((deck) => !deck.persisted)
      if (!initialized.current)
        temporary = saved.length
          ? []
          : [{ ...EMPTY_DECK, id: newId(), persisted: false }]
      temporary = temporary.flatMap((view) => {
        const accepted = saved.find((deck) => deck.id === view.id)
        if (!accepted) return [view]
        if (
          JSON.stringify(definition(accepted)) ===
          JSON.stringify(definition(view))
        )
          return []
        const id = newId()
        if (preferred === view.id) preferred = id
        setStorageError(
          'Your unsaved changes have been kept as a temporary copy.',
        )
        return [{ ...view, id }]
      })
      const all = [...saved.map(asView), ...temporary]
      if (!all.length)
        all.push({ ...EMPTY_DECK, id: newId(), persisted: false })
      if (!initialized.current) {
        try {
          preferred = localStorage.getItem(ACTIVE_DECK_KEY) ?? preferred
        } catch {
          /* Optional local preference. */
        }
      }
      const activeDeckId = all.some((deck) => deck.id === preferred)
        ? preferred
        : (all[0]?.id ?? '')
      if (initialized.current && activeDeckId !== preferred)
        setStorageError('This deck was deleted on another device.')
      initialized.current = true
      apply({ activeDeckId, decks: all })
    },
    [apply],
  )

  const refresh = useCallback(
    async (force = false) => {
      if (busy.current || (!force && editingRef.current)) return false
      const requestGeneration = generation.current
      const requestSequence = ++refreshSequence.current
      try {
        const result = await servicesRef.current.load()
        if (
          requestGeneration !== generation.current ||
          requestSequence !== refreshSequence.current ||
          busy.current ||
          (!force && editingRef.current)
        )
          return false
        if (!result.ok) throw new Error(result.error.message)
        if (force) setStorageError(undefined)
        reconcile(result.data)
        setReady(true)
        return true
      } catch {
        if (
          requestSequence !== refreshSequence.current ||
          requestGeneration !== generation.current
        )
          return false
        setStorageError('Unable to load saved decks. Please try again.')
        return false
      }
    },
    [reconcile],
  )

  useEffect(() => {
    try {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (legacy) {
        legacyWorkspaceSchema.parse(JSON.parse(legacy))
        setLegacyAvailable(true)
      }
    } catch {
      setStorageError(
        'Unable to load legacy decks. Your browser data has not been changed.',
      )
    }
    void refresh()
    const onFocus = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const timer = setInterval(onFocus, 5000)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  async function mutate<T>(
    operation: () => Promise<T>,
    accept: (value: T) => void,
  ) {
    if (busy.current) {
      setStorageError('Please wait until saving finishes.')
      return false
    }
    busy.current = true
    generation.current += 1
    setSaving(true)
    try {
      const result = await operation()
      accept(result)
      setStorageError(undefined)
      return true
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? error.message
          : 'Unable to save. Please try again.',
      )
      return false
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  function upsert(view: DeckView) {
    const previous = current.current
    apply({
      activeDeckId: view.id,
      decks: previous.decks.some((deck) => deck.id === view.id)
        ? previous.decks.map((deck) => (deck.id === view.id ? view : deck))
        : [...previous.decks, view],
    })
  }
  async function save(next: Deck, expectedRevision?: number) {
    const parsed = definition(next)
    const existing = current.current.decks.find((deck) => deck.id === parsed.id)
    if (!existing?.persisted) {
      if (busy.current) return false
      generation.current += 1
      upsert({ ...parsed, persisted: false })
      return true
    }
    return mutate(
      async () => {
        const result = await servicesRef.current.replace({
          data: {
            deck: parsed,
            expectedRevision: expectedRevision ?? existing.revision ?? 0,
          },
        })
        if (!result.ok) throw new Error(result.error.message)
        return result.data
      },
      (result) => upsert(asView(result)),
    )
  }
  function select(id: string) {
    if (!current.current.decks.some((deck) => deck.id === id))
      throw new Error('Deck not found.')
    apply({ ...current.current, activeDeckId: id })
    return true
  }
  function createTemporary(title: string, columns: Deck['columns'] = []) {
    const view = {
      ...definition({ id: newId(), title, columns }),
      persisted: false,
    }
    upsert(view)
    return view
  }
  async function persist(id: string) {
    const view = current.current.decks.find((deck) => deck.id === id)
    if (!view) throw new Error('Deck not found.')
    if (view.persisted) return true
    return mutate(
      async () => {
        const result = await servicesRef.current.create({
          data: definition(view),
        })
        if (!result.ok) throw new Error(result.error.message)
        return result.data
      },
      (result) => upsert(asView(result)),
    )
  }
  async function create(title: string) {
    const view = createTemporary(title)
    return persist(view.id)
  }
  async function remove(id: string, expectedRevision?: number) {
    const view = current.current.decks.find((deck) => deck.id === id)
    if (!view) throw new Error('Deck not found.')
    const accept = () => {
      const previous = current.current
      const decks = previous.decks.filter((deck) => deck.id !== id)
      if (!decks.length)
        decks.push({ ...EMPTY_DECK, id: newId(), persisted: false })
      apply({
        activeDeckId:
          previous.activeDeckId === id
            ? (decks[0]?.id ?? '')
            : previous.activeDeckId,
        decks,
      })
    }
    if (!view.persisted) {
      if (busy.current) return false
      accept()
      return true
    }
    return mutate(async () => {
      const result = await servicesRef.current.remove({
        data: { id, expectedRevision: expectedRevision ?? view.revision ?? 0 },
      })
      if (!result.ok) throw new Error(result.error.message)
    }, accept)
  }
  async function importLegacy() {
    return mutate(
      async () => {
        const data = legacyWorkspaceSchema.parse(
          JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? 'null'),
        )
        const result = await servicesRef.current.import({ data })
        if (!result.ok) throw new Error(result.error.message)
        return result.data
      },
      (result) => {
        reconcile(result)
        setLegacyAvailable(false)
        try {
          localStorage.removeItem(LEGACY_STORAGE_KEY)
        } catch {
          /* Server marker prevents duplicate imports on retry. */
        }
      },
    )
  }
  return {
    deck: workspace.decks.find(
      (deck) => deck.id === workspace.activeDeckId,
    ) ?? { ...EMPTY_DECK, persisted: false },
    workspace,
    ready,
    saving,
    storageError,
    legacyAvailable,
    save,
    create,
    createTemporary,
    persist,
    select,
    remove,
    refresh,
    importLegacy,
    getWorkspace: () => current.current,
  }
}
