import { useEffect, useState } from 'react'
import { type Deck, deckSchema, EMPTY_DECK } from './model'

export const DECK_STORAGE_KEY = 'twitter-lite-research-deck'

export function useDeck() {
  const [deck, setDeck] = useState<Deck>(EMPTY_DECK)
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState<string>()

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DECK_STORAGE_KEY)
      if (saved !== null) setDeck(deckSchema.parse(JSON.parse(saved)))
    } catch {
      setStorageError(
        '保存したデッキを読み込めませんでした。編集内容を保存すると、このブラウザのデッキを置き換えます。',
      )
    }
    setReady(true)
  }, [])

  function save(next: Deck) {
    const validated = deckSchema.parse(next)
    setDeck(validated)
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

  return { deck, ready, storageError, save }
}
