import { and, asc, eq } from 'drizzle-orm'
import { type AppDatabase, getDatabase } from '../storage/database.server'
import { connections, deckColumns, decks } from '../storage/schema'
import {
  type DeckPersistenceFailure,
  deleteDeckInputSchema,
  replaceDeckInputSchema,
  type SavedDeck,
  type SavedDeckDefinition,
  savedDeckDefinitionSchema,
  savedDeckSchema,
} from './persistence-model'

export class DeckPersistenceError extends Error {
  constructor(
    readonly code: DeckPersistenceFailure['error']['code'],
    message: string,
  ) {
    super(message)
  }
}
const conflict = () =>
  new DeckPersistenceError(
    'conflict',
    'This deck changed on another device. Reload the latest deck.',
  )
const missing = () =>
  new DeckPersistenceError(
    'not-found',
    'This deck was deleted or could not be found.',
  )

export function loadDeck(
  id: string,
  database = getDatabase(),
): SavedDeck | null {
  const record = database.select().from(decks).where(eq(decks.id, id)).get()
  if (!record) return null
  const columns = database
    .select({
      id: deckColumns.id,
      title: deckColumns.title,
      connectionId: deckColumns.connectionId,
      source: deckColumns.source,
    })
    .from(deckColumns)
    .where(eq(deckColumns.deckId, id))
    .orderBy(asc(deckColumns.position))
    .all()
  return savedDeckSchema.parse({ ...record, columns })
}

export function listDecks(database = getDatabase()): SavedDeck[] {
  return database.transaction(() =>
    database
      .select({ id: decks.id })
      .from(decks)
      .orderBy(asc(decks.createdAt), asc(decks.id))
      .all()
      .map(({ id }) => {
        const deck = loadDeck(id, database)
        if (!deck) throw missing()
        return deck
      }),
  )
}

function validateConnections(deck: SavedDeckDefinition, database: AppDatabase) {
  for (const column of deck.columns) {
    const connection = database
      .select({ platform: connections.platform, status: connections.status })
      .from(connections)
      .where(eq(connections.id, column.connectionId))
      .get()
    if (
      !connection ||
      connection.platform !== column.source.platform ||
      connection.status !== 'connected'
    ) {
      throw new DeckPersistenceError(
        'connection-unavailable',
        'The account for this column is unavailable. Check your connections.',
      )
    }
  }
}

function writeColumns(deck: SavedDeckDefinition, database: AppDatabase) {
  database.delete(deckColumns).where(eq(deckColumns.deckId, deck.id)).run()
  if (deck.columns.length)
    database
      .insert(deckColumns)
      .values(
        deck.columns.map((column, position) => ({
          ...column,
          deckId: deck.id,
          position,
        })),
      )
      .run()
}

export function createDeck(
  input: unknown,
  database = getDatabase(),
): SavedDeck {
  const deck = savedDeckDefinitionSchema.parse(input)
  return database.transaction(
    () => {
      const existing = loadDeck(deck.id, database)
      if (existing) {
        const original = savedDeckDefinitionSchema.parse({
          id: existing.id,
          title: existing.title,
          columns: existing.columns,
        })
        if (JSON.stringify(original) !== JSON.stringify(deck)) throw conflict()
        return existing
      }
      validateConnections(deck, database)
      const now = Date.now()
      const result = { ...deck, revision: 1, createdAt: now, updatedAt: now }
      database
        .insert(decks)
        .values({
          id: deck.id,
          title: deck.title,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      writeColumns(deck, database)
      return result
    },
    { behavior: 'immediate' },
  )
}

export function replaceDeck(
  input: unknown,
  database = getDatabase(),
): SavedDeck {
  const { deck, expectedRevision } = replaceDeckInputSchema.parse(input)
  return database.transaction(
    () => {
      const existing = loadDeck(deck.id, database)
      if (!existing) throw missing()
      if (existing.revision !== expectedRevision) throw conflict()
      validateConnections(deck, database)
      const updatedAt = Date.now()
      const result = database
        .update(decks)
        .set({ title: deck.title, revision: expectedRevision + 1, updatedAt })
        .where(and(eq(decks.id, deck.id), eq(decks.revision, expectedRevision)))
        .run()
      if (result.changes !== 1) throw conflict()
      writeColumns(deck, database)
      return {
        ...deck,
        revision: expectedRevision + 1,
        createdAt: existing.createdAt,
        updatedAt,
      }
    },
    { behavior: 'immediate' },
  )
}

export function deleteDeck(input: unknown, database = getDatabase()): string {
  const { id, expectedRevision } = deleteDeckInputSchema.parse(input)
  return database.transaction(
    () => {
      if (!loadDeck(id, database)) throw missing()
      const result = database
        .delete(decks)
        .where(and(eq(decks.id, id), eq(decks.revision, expectedRevision)))
        .run()
      if (result.changes !== 1) throw conflict()
      return id
    },
    { behavior: 'immediate' },
  )
}
