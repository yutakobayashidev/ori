import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_DECK } from './model'
import { DECK_STORAGE_KEY, useDeck } from './use-deck'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('saved deck', () => {
  it('restores saved conditions without overwriting them during mount', () => {
    const saved = { ...EMPTY_DECK, title: 'WebMCP調査' }
    localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(saved))
    const { result } = renderHook(useDeck)
    expect(result.current.ready).toBe(true)
    expect(result.current.deck).toEqual(saved)
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
  it('persists edits and restores them on remount', () => {
    const first = renderHook(useDeck)
    act(() =>
      first.result.current.save({ ...EMPTY_DECK, title: '保存した調査' }),
    )
    first.unmount()
    expect(renderHook(useDeck).result.current.deck.title).toBe('保存した調査')
  })
  it('reports failed writes instead of claiming that changes were saved', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { result } = renderHook(useDeck)
    act(() => result.current.save({ ...EMPTY_DECK, title: '未保存' }))
    expect(result.current.deck.title).toBe('未保存')
    expect(result.current.storageError).toContain('保存できません')
  })
})
