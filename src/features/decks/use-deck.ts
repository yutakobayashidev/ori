import { useEffect, useRef, useState } from 'react'
import {
  type Deck,
  deckSchema,
  EMPTY_DECK,
  EMPTY_WORKSPACE,
  newId,
  type Workspace,
  workspaceSchema,
} from './model'

export const DECK_STORAGE_KEY = 'twitter-lite-research-deck'

export function useDeck() {
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY_WORKSPACE)
  const current = useRef(workspace)
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState<string>()

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DECK_STORAGE_KEY)
      if (saved !== null) {
        const restored = workspaceSchema.parse(JSON.parse(saved))
        current.current = restored
        setWorkspace(restored)
      }
    } catch {
      setStorageError(
        '保存したデッキを読み込めませんでした。編集内容を保存すると、このブラウザのデッキを置き換えます。',
      )
    }
    setReady(true)
  }, [])

  function persist(next: Workspace) {
    const validated = workspaceSchema.parse(next)
    current.current = validated
    setWorkspace(validated)
    try {
      localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(validated))
      setStorageError(undefined)
      return true
    } catch {
      setStorageError(
        'このブラウザに保存できません。現在の変更は、ページを閉じると失われます。',
      )
      return false
    }
  }

  function save(next: Deck) {
    const validated = deckSchema.parse(next)
    const previous = current.current
    const exists = previous.decks.some((deck) => deck.id === validated.id)
    return persist({
      ...previous,
      activeDeckId: validated.id,
      decks: exists
        ? previous.decks.map((deck) =>
            deck.id === validated.id ? validated : deck,
          )
        : [...previous.decks, validated],
    })
  }

  function create(title: string) {
    return save({ id: newId(), title, columns: [] })
  }
  function select(id: string) {
    if (!current.current.decks.some((deck) => deck.id === id))
      throw new Error('デッキが見つかりません。')
    return persist({ ...current.current, activeDeckId: id })
  }
  function remove(id: string) {
    const previous = current.current
    if (!previous.decks.some((deck) => deck.id === id))
      throw new Error('デッキが見つかりません。')
    const decks = previous.decks.filter((deck) => deck.id !== id)
    const first = decks[0]
    if (!first) throw new Error('最後のデッキは削除できません。')
    return persist({
      ...previous,
      decks,
      activeDeckId:
        previous.activeDeckId === id ? first.id : previous.activeDeckId,
    })
  }

  const deck =
    workspace.decks.find((deck) => deck.id === workspace.activeDeckId) ??
    EMPTY_DECK
  return {
    deck,
    workspace,
    ready,
    storageError,
    save,
    create,
    select,
    remove,
    getWorkspace: () => current.current,
  }
}
