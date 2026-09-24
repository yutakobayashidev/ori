import { createHash, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { getDatabase } from '../storage/database.server'
import { connections, legacyImports } from '../storage/schema'
import { legacyWorkspaceSchema } from './legacy-import'
import {
  createDeck,
  DeckPersistenceError,
  listDecks,
} from './repository.server'

export function importLegacyWorkspace(
  input: unknown,
  database = getDatabase(),
  relayOrigin = new URL(process.env.TWITTER_RELAY_BASE_URL ?? '').origin,
) {
  const legacy = legacyWorkspaceSchema.parse(input)
  const payloadHash = createHash('sha256')
    .update(JSON.stringify(legacy.decks))
    .digest('hex')
  return database.transaction(
    () => {
      const marker = database
        .select()
        .from(legacyImports)
        .where(eq(legacyImports.id, 'local-storage-v2'))
        .get()
      if (marker) {
        if (marker.payloadHash !== payloadHash)
          throw new DeckPersistenceError(
            'conflict',
            '旧デッキはすでに取り込み済みです。別の内容で上書きできません。',
          )
        return listDecks(database)
      }
      const available = database
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.platform, 'twitter'),
            eq(connections.origin, relayOrigin),
            eq(connections.status, 'connected'),
          ),
        )
        .all()
      const imported = legacy.decks.map((deck) =>
        createDeck(
          {
            ...deck,
            id: randomUUID(),
            columns: deck.columns.map(({ profileName, ...column }) => {
              const connection = available.find(
                (connection) => connection.relayProfile === profileName,
              )
              if (!connection)
                throw new DeckPersistenceError(
                  'connection-unavailable',
                  `旧プロファイル「${profileName}」に対応する接続がありません。接続一覧を更新してください。`,
                )
              return { ...column, connectionId: connection.id }
            }),
          },
          database,
        ),
      )
      database
        .insert(legacyImports)
        .values({
          id: 'local-storage-v2',
          payloadHash,
          deckIds: imported.map((deck) => deck.id),
          createdAt: Date.now(),
        })
        .run()
      return listDecks(database)
    },
    { behavior: 'immediate' },
  )
}
