import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { ResearchRun } from "../research/model";

const timestamps = {
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
};
export const connections = sqliteTable(
  "connections",
  {
    id: text("id").primaryKey(),
    platform: text("platform", { enum: ["twitter", "mastodon"] }).notNull(),
    origin: text("origin").notNull(),
    accountId: text("account_id"),
    relayProfile: text("relay_profile"),
    displayName: text("display_name").notNull(),
    status: text("status", {
      enum: ["connected", "disconnected", "expired"],
    }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("connections_account").on(table.platform, table.origin, table.accountId),
    uniqueIndex("connections_relay_profile").on(table.origin, table.relayProfile),
  ],
);

export const decks = sqliteTable(
  "decks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    revision: integer("revision").notNull().default(1),
    ...timestamps,
  },
  (table) => [check("decks_positive_revision", sql`${table.revision} >= 1`)],
);

export const deckColumns = sqliteTable(
  "deck_columns",
  {
    id: text("id").notNull(),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    source: text("source", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.deckId, table.id] }),
    uniqueIndex("deck_columns_position").on(table.deckId, table.position),
    check("deck_columns_valid_position", sql`${table.position} >= 0`),
  ],
);

// Credential fields contain opaque authenticated-encryption envelopes, never plaintext.
export const connectionCredentials = sqliteTable("connection_credentials", {
  connectionId: text("connection_id")
    .primaryKey()
    .references(() => connections.id, { onDelete: "cascade" }),
  encryptedToken: text("encrypted_token").notNull(),
  appId: text("app_id").references(() => oauthApps.id, {
    onDelete: "restrict",
  }),
  updatedAt: integer("updated_at").notNull(),
});

export const oauthApps = sqliteTable(
  "oauth_apps",
  {
    id: text("id").primaryKey(),
    origin: text("origin").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    scopes: text("scopes").notNull(),
    clientId: text("client_id").notNull(),
    encryptedClientSecret: text("encrypted_client_secret").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("oauth_apps_configuration").on(table.origin, table.redirectUri, table.scopes),
  ],
);

export const oauthAttempts = sqliteTable("oauth_attempts", {
  stateHash: text("state_hash").primaryKey(),
  browserHash: text("browser_hash").notNull(),
  appId: text("app_id")
    .notNull()
    .references(() => oauthApps.id, { onDelete: "cascade" }),
  encryptedVerifier: text("encrypted_verifier").notNull(),
  connectionId: text("connection_id").references(() => connections.id, {
    onDelete: "cascade",
  }),
  expiresAt: integer("expires_at").notNull(),
  consumedAt: integer("consumed_at"),
});

export const legacyImports = sqliteTable("legacy_imports", {
  id: text("id").primaryKey(),
  payloadHash: text("payload_hash").notNull(),
  deckIds: text("deck_ids", { mode: "json" }).$type<string[]>().notNull(),
  createdAt: integer("created_at").notNull(),
});

export const researchSessions = sqliteTable("research_sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").$type<ResearchRun["status"]>().notNull(),
  updatedAt: integer("updated_at").notNull(),
  snapshot: text("snapshot", { mode: "json" }).$type<ResearchRun>().notNull(),
});

export const workspaceOwner = sqliteTable(
  "workspace_owner",
  {
    id: integer("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    onboardingCompletedAt: integer("onboarding_completed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [check("workspace_owner_singleton", sql`${table.id} = 1`)],
);

export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => workspaceOwner.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
});

export const authThrottle = sqliteTable(
  "auth_throttle",
  {
    id: integer("id").primaryKey(),
    attempts: integer("attempts").notNull(),
    resetAt: integer("reset_at").notNull(),
  },
  (table) => [check("auth_throttle_singleton", sql`${table.id} = 1`)],
);

export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  proposal: text("proposal", { mode: "json" })
    .$type<import("../activities/model").ActivityProposal>()
    .notNull(),
  userState: text("user_state").$type<import("../activities/model").ActivityState>().notNull(),
  userOverrides: text("user_overrides", { mode: "json" })
    .$type<import("../activities/model").ActivityOverrides>()
    .notNull(),
  ...timestamps,
});
export const activityRevision = sqliteTable(
  "activity_revision",
  {
    id: integer("id").primaryKey(),
    revision: integer("revision").notNull(),
  },
  (table) => [
    check("activity_revision_singleton", sql`${table.id} = 1`),
    check("activity_revision_nonnegative", sql`${table.revision} >= 0`),
  ],
);
export const activityReceipts = sqliteTable("activity_receipts", {
  requestId: text("request_id").primaryKey(),
  inputHash: text("input_hash").notNull(),
  result: text("result", { mode: "json" })
    .$type<import("../activities/model").ActivityReceipt>()
    .notNull(),
});

export const mcpEventSubscriptions = sqliteTable("mcp_event_subscriptions", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  argumentsJson: text("arguments_json").notNull(),
  callbackUrl: text("callback_url").notNull(),
  secretCiphertext: text("secret_ciphertext").notNull(),
  previousSecretCiphertext: text("previous_secret_ciphertext"),
  rotationExpiresAt: integer("rotation_expires_at"),
  verifiedAt: integer("verified_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  ...timestamps,
});

export const mcpEventOutbox = sqliteTable(
  "mcp_event_outbox",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => mcpEventSubscriptions.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    body: text("body").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at").notNull(),
    createdAt: integer("created_at").notNull(),
    deliveredAt: integer("delivered_at"),
    failedAt: integer("failed_at"),
    lastError: text("last_error"),
  },
  (table) => [
    uniqueIndex("mcp_event_outbox_identity").on(table.subscriptionId, table.eventId),
    index("mcp_event_outbox_due").on(table.nextAttemptAt),
  ],
);

export const beeperChatCheckpoints = sqliteTable(
  "beeper_chat_checkpoints",
  {
    targetId: text("target_id").notNull(),
    chatId: text("chat_id").notNull(),
    cursor: text("cursor"),
    anchorMessageId: text("anchor_message_id"),
    pendingAnchorMessageId: text("pending_anchor_message_id"),
    startedAt: text("started_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.targetId, table.chatId] })],
);

export const beeperSeenMessages = sqliteTable(
  "beeper_seen_messages",
  {
    targetId: text("target_id").notNull(),
    chatId: text("chat_id").notNull(),
    messageId: text("message_id").notNull(),
    observedAt: text("observed_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.targetId, table.chatId, table.messageId] })],
);
