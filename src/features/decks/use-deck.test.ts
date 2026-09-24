import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_DECK, EMPTY_WORKSPACE } from './model'
import { DECK_STORAGE_KEY, useDeck } from './use-deck'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})
describe('saved decks', () => {
  it('restores saved conditions without overwriting them during mount', () => {
    const deck = { ...EMPTY_DECK, title: 'WebMCP調査' }
    const saved = { ...EMPTY_WORKSPACE, decks: [deck] }
    localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(saved))
    const { result } = renderHook(useDeck)
    expect(result.current.ready).toBe(true)
    expect(result.current.deck).toEqual(deck)
    expect(JSON.parse(localStorage.getItem(DECK_STORAGE_KEY) ?? '')).toEqual(
      saved,
    )
  })
  it('keeps invalid saved data untouched and explains the failure', () => {
    localStorage.setItem(DECK_STORAGE_KEY, '{broken')
    const { result } = renderHook(useDeck)
    expect(result.current.storageError).toContain('読み込めません')
    expect(localStorage.getItem(DECK_STORAGE_KEY)).toBe('{broken')
  })
  it('reports failed writes while keeping changes usable in memory', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { result } = renderHook(useDeck)
    let persisted = true
    act(() => {
      persisted = result.current.save({ ...EMPTY_DECK, title: '未保存' })
    })
    expect(persisted).toBe(false)
    expect(result.current.deck.title).toBe('未保存')
    expect(result.current.storageError).toContain('保存できません')
  })
  it('keeps decks isolated through immediate create, edit, switch and reload', () => {
    const { result, unmount } = renderHook(useDeck)
    const firstId = result.current.deck.id
    let secondId = ''
    act(() => {
      result.current.create('第二の調査')
      secondId = result.current.getWorkspace().activeDeckId
      result.current.save({
        id: secondId,
        title: '変更した第二の調査',
        columns: [],
      })
      result.current.select(firstId)
    })
    expect(result.current.deck.title).toBe('新しい調査')
    expect(result.current.workspace.decks).toHaveLength(2)
    unmount()
    const restored = renderHook(useDeck)
    act(() => restored.result.current.select(secondId))
    expect(restored.result.current.deck.title).toBe('変更した第二の調査')
    act(() => restored.result.current.remove(secondId))
    expect(restored.result.current.deck.id).toBe(firstId)
    expect(() => restored.result.current.remove(firstId)).toThrow('最後')
    expect(() => restored.result.current.select('missing')).toThrow()
  })
})
