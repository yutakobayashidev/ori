// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { type AppDatabase, openDatabase } from '../storage/database.server'
import {
  connectionCredentials,
  connections,
  deckColumns,
} from '../storage/schema'
import type { SavedDeckDefinition } from './persistence-model'
import {
  createDeck,
  deleteDeck,
  listDecks,
  loadDeck,
  replaceDeck,
} from './repository.server'

let directory: string
let database: AppDatabase
let second: AppDatabase
const deck: SavedDeckDefinition = {
  id: 'request-123',
  title: 'Research',
  columns: [
    {
      id: 'first',
      title: 'First',
      connectionId: 'twitter-one',
      source: {
        platform: 'twitter',
        kind: 'search',
        query: 'WebMCP',
        product: 'Latest',
        following: false,
      },
    },
    {
      id: 'second',
      title: 'Second',
      connectionId: 'twitter-two',
      source: { platform: 'twitter', kind: 'user', target: 'alice' },
    },
  ],
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'twitter-lite-deck-repository-'))
  database = openDatabase(join(directory, 'app.db'))
  second = openDatabase(join(directory, 'app.db'))
  database
    .insert(connections)
    .values(
      ['twitter-one', 'twitter-two'].map((id) => ({
        id,
        platform: 'twitter' as const,
        origin: 'https://relay.invalid',
        relayProfile: id,
        displayName: id,
        status: 'connected' as const,
        createdAt: 1,
        updatedAt: 1,
      })),
    )
    .run()
})
afterEach(() => {
  second.$client.close()
  database.$client.close()
  rmSync(directory, { recursive: true })
})

it('shares deck order and per-column account bindings with a separate database client', () => {
  const saved = createDeck(deck, database)
  expect(saved).toMatchObject({ ...deck, revision: 1 })
  expect(loadDeck(deck.id, second)).toEqual(saved)
  expect(listDecks(second)).toEqual([saved])
})

it('makes retried creation idempotent but rejects different content using the same ID', () => {
  const saved = createDeck(deck, database)
  expect(createDeck(deck, second)).toEqual(saved)
  expect(() =>
    createDeck({ ...deck, title: 'Different request' }, second),
  ).toThrow('別の端末で変更されました')
  expect(listDecks(database)).toEqual([saved])
})

it('replaces title, ordered columns and bindings atomically, then rejects stale edits', () => {
  const initial = createDeck(deck, database)
  const reversed = {
    ...deck,
    title: 'Changed',
    columns: [...deck.columns].reverse(),
  }
  const saved = replaceDeck(
    { deck: reversed, expectedRevision: initial.revision },
    database,
  )
  expect(saved).toMatchObject({
    ...reversed,
    revision: 2,
    createdAt: initial.createdAt,
  })
  expect(() => replaceDeck({ deck, expectedRevision: 1 }, second)).toThrow(
    '別の端末で変更されました',
  )
  expect(loadDeck(deck.id, second)).toEqual(saved)
})

it('clears all columns and prevents stale deletion from another device', () => {
  createDeck(deck, database)
  const saved = replaceDeck(
    { deck: { ...deck, columns: [] }, expectedRevision: 1 },
    database,
  )
  expect(loadDeck(deck.id, second)?.columns).toEqual([])
  expect(() =>
    deleteDeck({ id: deck.id, expectedRevision: 1 }, second),
  ).toThrow('別の端末で変更されました')
  expect(loadDeck(deck.id, second)).toEqual(saved)
  expect(deleteDeck({ id: deck.id, expectedRevision: 2 }, second)).toBe(deck.id)
  expect(loadDeck(deck.id, database)).toBeNull()
})

it('cascades deleted deck columns and reports already-deleted decks', () => {
  createDeck(deck, database)
  deleteDeck({ id: deck.id, expectedRevision: 1 }, database)
  expect(database.select().from(deckColumns).all()).toEqual([])
  expect(() => replaceDeck({ deck, expectedRevision: 1 }, second)).toThrow(
    'このデッキは削除されたか',
  )
  expect(() =>
    deleteDeck({ id: deck.id, expectedRevision: 1 }, second),
  ).toThrow('このデッキは削除されたか')
})

it.each([
  'disconnected',
  'expired',
] as const)('rejects %s connections without partially saving a deck', (status) => {
  const initial = createDeck(deck, database)
  database
    .update(connections)
    .set({ status })
    .where(eq(connections.id, 'twitter-two'))
    .run()
  expect(() =>
    replaceDeck(
      { deck: { ...deck, title: 'Should not save' }, expectedRevision: 1 },
      database,
    ),
  ).toThrow('カラムの接続アカウントが利用できません')
  expect(loadDeck(deck.id, second)).toEqual(initial)
})

it('rejects a connection from another platform', () => {
  database
    .update(connections)
    .set({ platform: 'mastodon' })
    .where(eq(connections.id, 'twitter-one'))
    .run()
  expect(() => createDeck(deck, database)).toThrow(
    'カラムの接続アカウントが利用できません',
  )
  expect(listDecks(database)).toEqual([])
})

it('rejects unknown connections without creating rows', () => {
  database.delete(connections).where(eq(connections.id, 'twitter-two')).run()
  expect(() => createDeck(deck, database)).toThrow(
    'カラムの接続アカウントが利用できません',
  )
  expect(listDecks(database)).toEqual([])
})

it('rejects duplicate column IDs without changing the saved version', () => {
  const saved = createDeck(deck, database)
  expect(() =>
    replaceDeck(
      {
        deck: { ...deck, columns: [deck.columns[0], deck.columns[0]] },
        expectedRevision: 1,
      },
      database,
    ),
  ).toThrow('カラム ID が重複しています')
  expect(loadDeck(deck.id, database)).toEqual(saved)
})

it('returns only deck definitions and revision metadata, never credential data', () => {
  database
    .insert(connectionCredentials)
    .values({
      connectionId: 'twitter-one',
      encryptedToken: 'secret-envelope',
      updatedAt: 1,
    })
    .run()
  createDeck(deck, database)
  const loaded = listDecks(database)
  expect(Object.keys(loaded[0] ?? {}).sort()).toEqual([
    'columns',
    'createdAt',
    'id',
    'revision',
    'title',
    'updatedAt',
  ])
  expect(JSON.stringify(loaded)).not.toContain('secret-envelope')
  expect(JSON.stringify(loaded)).not.toContain('relayProfile')
})
