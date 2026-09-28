import { expect, it, vi } from 'vitest'
import type { Deck, Workspace } from '../decks/model'
import { syncResearchDeck } from './research-deck-sync'

const plan: Deck = { id: 'plan1', title: '調査計画', columns: [] }
function setup() {
  const state: { workspace: Workspace } = {
    workspace: {
      activeDeckId: 'saved',
      decks: [
        {
          id: 'saved',
          title: '保存済み',
          columns: [],
          persisted: true,
          revision: 1,
        },
      ],
    },
  }
  const bindings = new Map<string, string>()
  const actions = {
    getWorkspace: () => state.workspace,
    createTemporary: vi.fn((title: string, columns: Deck['columns']) => {
      const deck = {
        id: `temp${state.workspace.decks.length}`,
        title,
        columns,
        persisted: false,
      }
      state.workspace.decks.push(deck)
      state.workspace.activeDeckId = deck.id
      return deck
    }),
    save: vi.fn(async (deck: Deck) => {
      state.workspace.decks = state.workspace.decks.map((existing) =>
        existing.id === deck.id ? { ...deck, persisted: false } : existing,
      )
      state.workspace.activeDeckId = deck.id
      return true
    }),
    select: vi.fn((id: string) => {
      state.workspace.activeDeckId = id
    }),
  }
  return { state, bindings, actions }
}

it('updates the same temporary view without switching away from the user’s current deck', async () => {
  const { state, bindings, actions } = setup()
  await syncResearchDeck(plan, false, bindings, actions)
  const temporaryId = state.workspace.activeDeckId
  actions.select('saved')
  await syncResearchDeck(
    { ...plan, title: '更新した計画' },
    false,
    bindings,
    actions,
  )
  expect(actions.createTemporary).toHaveBeenCalledOnce()
  expect(
    state.workspace.decks.find((deck) => deck.id === temporaryId)?.title,
  ).toBe('更新した計画')
  expect(state.workspace.activeDeckId).toBe('saved')
  await syncResearchDeck(plan, true, bindings, actions)
  expect(state.workspace.activeDeckId).toBe(temporaryId)
})

it('creates another temporary view if the previous one was saved, preserving the saved definition', async () => {
  const { state, bindings, actions } = setup()
  await syncResearchDeck(plan, false, bindings, actions)
  const originalId = bindings.get(plan.id)
  state.workspace.decks = state.workspace.decks.map((deck) => ({
    ...deck,
    persisted: true,
  }))
  actions.select('saved')
  await syncResearchDeck(
    { ...plan, title: '追加調査' },
    false,
    bindings,
    actions,
  )
  expect(bindings.get(plan.id)).not.toBe(originalId)
  expect(
    state.workspace.decks.find((deck) => deck.id === originalId)?.title,
  ).toBe(plan.title)
  expect(state.workspace.activeDeckId).toBe('saved')
})

it('creates a replacement after removal without stealing selection during an automatic update', async () => {
  const { state, bindings, actions } = setup()
  await syncResearchDeck(plan, false, bindings, actions)
  state.workspace.decks = state.workspace.decks.filter((deck) => deck.persisted)
  actions.select('saved')
  await syncResearchDeck(plan, false, bindings, actions)
  expect(actions.createTemporary).toHaveBeenCalledTimes(2)
  expect(state.workspace.activeDeckId).toBe('saved')
})

it('propagates failed saves so the user can retry instead of reporting successful synchronization', async () => {
  const { bindings, actions } = setup()
  await syncResearchDeck(plan, false, bindings, actions)
  actions.save.mockResolvedValueOnce(false)
  await expect(
    syncResearchDeck(plan, false, bindings, actions),
  ).rejects.toThrow('Unable to update the temporary deck')
  await expect(
    syncResearchDeck(plan, true, bindings, actions),
  ).resolves.toBeUndefined()
  expect(actions.createTemporary).toHaveBeenCalledOnce()
})
