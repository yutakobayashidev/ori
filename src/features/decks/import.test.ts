// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { type AppDatabase, openDatabase } from '../storage/database.server'
import { connections, legacyImports } from '../storage/schema'
import { importLegacyWorkspace } from './import.server'
import { createDeck, listDecks } from './repository.server'

let database: AppDatabase
const legacy = {
  version: 2,
  activeDeckId: 'same-id',
  decks: [
    {
      id: 'same-id',
      title: 'Legacy',
      columns: [
        {
          id: 'a',
          title: 'Account',
          profileName: 'old-profile',
          source: { platform: 'twitter', kind: 'user', target: 'alice' },
        },
      ],
    },
  ],
}
beforeEach(() => {
  database = openDatabase(':memory:')
  database
    .insert(connections)
    .values({
      id: 'new-connection-id',
      platform: 'twitter',
      origin: 'https://relay.invalid',
      relayProfile: 'old-profile',
      displayName: 'Old account',
      status: 'connected',
      createdAt: 1,
      updatedAt: 1,
    })
    .run()
})
afterEach(() => database.$client.close())
it('imports legacy profiles as connection bindings without overwriting existing same-ID decks', () => {
  const existing = createDeck(
    { id: 'same-id', title: 'Existing server deck', columns: [] },
    database,
  )
  const result = importLegacyWorkspace(
    legacy,
    database,
    'https://relay.invalid',
  )
  expect(result).toHaveLength(2)
  expect(result.find((deck) => deck.id === existing.id)).toEqual(existing)
  const imported = result.find((deck) => deck.title === 'Legacy')
  expect(imported?.id).not.toBe('same-id')
  expect(imported?.columns[0]).toEqual({
    id: 'a',
    title: 'Account',
    connectionId: 'new-connection-id',
    source: { platform: 'twitter', kind: 'user', target: 'alice' },
  })
  expect(
    importLegacyWorkspace(legacy, database, 'https://relay.invalid'),
  ).toEqual(result)
})
it('blocks a different browser snapshot after the one-time import', () => {
  const result = importLegacyWorkspace(
    legacy,
    database,
    'https://relay.invalid',
  )
  expect(() =>
    importLegacyWorkspace(
      { ...legacy, decks: [{ ...legacy.decks[0], title: 'Different' }] },
      database,
      'https://relay.invalid',
    ),
  ).toThrow('旧デッキはすでに取り込み済みです')
  expect(listDecks(database)).toEqual(result)
})
it('rolls back all imported decks and marker when any profile is unavailable', () => {
  const second = {
    ...legacy.decks[0],
    id: 'second',
    columns: [{ ...legacy.decks[0]?.columns[0], profileName: 'missing' }],
  }
  expect(() =>
    importLegacyWorkspace(
      { ...legacy, decks: [...legacy.decks, second] },
      database,
      'https://relay.invalid',
    ),
  ).toThrow('対応する接続がありません')
  expect(listDecks(database)).toEqual([])
  expect(database.select().from(legacyImports).all()).toEqual([])
})
