import { sql } from 'drizzle-orm'
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import type { ResearchRun } from '../research/model'

const timestamps = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}
export const connections = sqliteTable(
  'connections',
  {
    id: text('id').primaryKey(),
    platform: text('platform', { enum: ['twitter', 'mastodon'] }).notNull(),
    origin: text('origin').notNull(),
    accountId: text('account_id'),
    relayProfile: text('relay_profile'),
    displayName: text('display_name').notNull(),
    status: text('status', {
      enum: ['connected', 'disconnected', 'expired'],
    }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('connections_account').on(
      table.platform,
      table.origin,
      table.accountId,
    ),
    uniqueIndex('connections_relay_profile').on(
      table.origin,
      table.relayProfile,
    ),
  ],
)

export const decks = sqliteTable(
  'decks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [check('decks_positive_revision', sql`${table.revision} >= 1`)],
)

export const deckColumns = sqliteTable(
  'deck_columns',
  {
    id: text('id').notNull(),
    deckId: text('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    source: text('source', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.deckId, table.id] }),
    uniqueIndex('deck_columns_position').on(table.deckId, table.position),
    check('deck_columns_valid_position', sql`${table.position} >= 0`),
  ],
)

// Credential fields contain opaque authenticated-encryption envelopes, never plaintext.
export const connectionCredentials = sqliteTable('connection_credentials', {
  connectionId: text('connection_id')
    .primaryKey()
    .references(() => connections.id, { onDelete: 'cascade' }),
  encryptedToken: text('encrypted_token').notNull(),
  appId: text('app_id').references(() => oauthApps.id, {
    onDelete: 'restrict',
  }),
  updatedAt: integer('updated_at').notNull(),
})

export const oauthApps = sqliteTable(
  'oauth_apps',
  {
    id: text('id').primaryKey(),
    origin: text('origin').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    scopes: text('scopes').notNull(),
    clientId: text('client_id').notNull(),
    encryptedClientSecret: text('encrypted_client_secret').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('oauth_apps_configuration').on(
      table.origin,
      table.redirectUri,
      table.scopes,
    ),
  ],
)

export const oauthAttempts = sqliteTable('oauth_attempts', {
  stateHash: text('state_hash').primaryKey(),
  browserHash: text('browser_hash').notNull(),
  appId: text('app_id')
    .notNull()
    .references(() => oauthApps.id, { onDelete: 'cascade' }),
  encryptedVerifier: text('encrypted_verifier').notNull(),
  connectionId: text('connection_id').references(() => connections.id, {
    onDelete: 'cascade',
  }),
  expiresAt: integer('expires_at').notNull(),
  consumedAt: integer('consumed_at'),
})

export const legacyImports = sqliteTable('legacy_imports', {
  id: text('id').primaryKey(),
  payloadHash: text('payload_hash').notNull(),
  deckIds: text('deck_ids', { mode: 'json' }).$type<string[]>().notNull(),
  createdAt: integer('created_at').notNull(),
})

export const researchSessions = sqliteTable('research_sessions', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').$type<ResearchRun['status']>().notNull(),
  updatedAt: integer('updated_at').notNull(),
  snapshot: text('snapshot', { mode: 'json' }).$type<ResearchRun>().notNull(),
})

export const researchState = sqliteTable(
  'research_state',
  {
    id: integer('id').primaryKey(),
    activeSessionId: text('active_session_id').references(
      () => researchSessions.id,
      { onDelete: 'set null' },
    ),
  },
  (table) => [check('research_state_singleton', sql`${table.id} = 1`)],
)

export const workspaceOwner = sqliteTable(
  'workspace_owner',
  {
    id: integer('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    onboardingCompletedAt: integer('onboarding_completed_at'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [check('workspace_owner_singleton', sql`${table.id} = 1`)],
)

export const authSessions = sqliteTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  ownerId: integer('owner_id')
    .notNull()
    .references(() => workspaceOwner.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
})

export const authThrottle = sqliteTable(
  'auth_throttle',
  {
    id: integer('id').primaryKey(),
    attempts: integer('attempts').notNull(),
    resetAt: integer('reset_at').notNull(),
  },
  (table) => [check('auth_throttle_singleton', sql`${table.id} = 1`)],
)
