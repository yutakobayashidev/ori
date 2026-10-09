// @vitest-environment node
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { subscribeMcpEvent } from "../mcp-events/events.server";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import { beeperSeenMessages, mcpEventOutbox } from "../storage/schema";
import { createBeeperListenerStore } from "./repository.server";
import { reconcileBeeperChat } from "./listener.server";
import type { BeeperAdapter } from "./adapter.server";

let database: AppDatabase;
let directory: string;
const now = new Date().toISOString();
const input = {
  targetId: "um790",
  chatId: "chat-one",
  checkpoint: {
    cursor: null,
    anchorMessageId: "message-one",
    pendingAnchorMessageId: null,
    startedAt: now,
  },
  messages: [
    {
      eventName: "beeper.message.received" as const,
      targetId: "um790",
      accountId: "account-one",
      chatId: "chat-one",
      messageId: "message-one",
      observedAt: now,
      occurredAt: now,
      excerpt: "Please review",
    },
  ],
};
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "beeper-store-test-"));
  const key = join(directory, "key");
  writeFileSync(key, randomBytes(32).toString("base64"), { mode: 0o600 });
  vi.stubEnv("TWITTER_LITE_CREDENTIAL_KEY_FILE", key);
  database = openDatabase(":memory:");
  await subscribeMcpEvent(
    {
      name: "beeper.message.received",
      arguments: { chatIds: ["chat-one"] },
      delivery: {
        mode: "webhook",
        url: "https://callback.invalid/events",
        secret: `whsec_${Buffer.alloc(32, 42).toString("base64")}`,
      },
    },
    database,
    {
      now: Date.parse(now) - 1000,
      sender: async (_url, body) => ({
        status: 200,
        body: JSON.stringify({ challenge: JSON.parse(body).challenge }),
      }),
    },
  );
});
afterEach(() => {
  database.$client.close();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

it("persists deduplication with the outbox and checkpoint across listener recreation", () => {
  createBeeperListenerStore(database).commitPage(input);
  const restarted = createBeeperListenerStore(database);
  restarted.commitPage(input);
  expect(restarted.getCheckpoint("um790", "chat-one")).toMatchObject(input.checkpoint);
  expect(database.select().from(beeperSeenMessages).all()).toHaveLength(1);
  expect(database.select().from(mcpEventOutbox).all()).toHaveLength(1);
});

it("rolls back seen messages and checkpoint when outbox validation fails", () => {
  const store = createBeeperListenerStore(database);
  const message = input.messages[0];
  expect(message).toBeDefined();
  expect(() =>
    store.commitPage({
      ...input,
      messages: [
        message as (typeof input.messages)[number],
        {
          ...(message as (typeof input.messages)[number]),
          messageId: "bad",
          excerpt: "x".repeat(1001),
        },
      ],
    }),
  ).toThrow(/Too big/);
  expect(store.getCheckpoint("um790", "chat-one")).toBeUndefined();
  expect(database.select().from(beeperSeenMessages).all()).toHaveLength(0);
  expect(database.select().from(mcpEventOutbox).all()).toHaveLength(0);
});

it("deduplicates outgoing observations across listener recreation", async () => {
  await subscribeMcpEvent(
    {
      name: "beeper.message.sent",
      arguments: { chatIds: ["chat-one"] },
      delivery: {
        mode: "webhook",
        url: "https://callback.invalid/events",
        secret: `whsec_${Buffer.alloc(32, 42).toString("base64")}`,
      },
    },
    database,
    {
      now: Date.parse(now) - 1000,
      sender: async (_url, body) => ({
        status: 200,
        body: JSON.stringify({ challenge: JSON.parse(body).challenge }),
      }),
    },
  );
  const outgoing = {
    ...input,
    messages: input.messages.map((message) => ({
      ...message,
      eventName: "beeper.message.sent" as const,
    })),
  };
  createBeeperListenerStore(database).commitPage(outgoing);
  createBeeperListenerStore(database).commitPage(outgoing);
  expect(database.select().from(beeperSeenMessages).all()).toHaveLength(1);
  const rows = database.select().from(mcpEventOutbox).all();
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0]?.body ?? "{}")).toMatchObject({
    name: "beeper.message.sent",
    data: { messageId: "message-one" },
  });
});

it("observes new outgoing messages after adding a sent subscription to an already watched chat", async () => {
  const old = {
    id: "previous-outgoing",
    chatID: "chat-one",
    accountID: "account-one",
    timestamp: new Date(Date.parse(now) - 800).toISOString(),
    isSender: true,
    text: "Older reply",
  };
  const readMessages = vi.fn<BeeperAdapter["readMessages"]>().mockResolvedValue({
    items: [old],
    hasMore: false,
    oldestCursor: null,
    newestCursor: null,
  });
  const adapter: BeeperAdapter = {
    targetId: "um790",
    readMessages,
    listChats: vi.fn<BeeperAdapter["listChats"]>(),
    watch: vi.fn<BeeperAdapter["watch"]>(),
  };
  const scope = { chatId: "chat-one", startedAt: new Date(Date.parse(now) - 1000).toISOString() };
  const store = createBeeperListenerStore(database);
  await reconcileBeeperChat(adapter, store, scope);
  expect(database.select().from(mcpEventOutbox).all()).toHaveLength(0);
  await subscribeMcpEvent(
    {
      name: "beeper.message.sent",
      arguments: { chatIds: ["chat-one"] },
      delivery: {
        mode: "webhook",
        url: "https://callback.invalid/events",
        secret: `whsec_${Buffer.alloc(32, 42).toString("base64")}`,
      },
    },
    database,
    {
      now: Date.parse(now) - 500,
      sender: async (_url, body) => ({
        status: 200,
        body: JSON.stringify({ challenge: JSON.parse(body).challenge }),
      }),
    },
  );
  readMessages.mockResolvedValue({
    items: [{ ...old, id: "new-outgoing", timestamp: now }, old],
    hasMore: false,
    oldestCursor: null,
    newestCursor: null,
  });
  await reconcileBeeperChat(adapter, store, scope);
  await reconcileBeeperChat(adapter, createBeeperListenerStore(database), scope);
  const rows = database.select().from(mcpEventOutbox).all();
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0]?.body ?? "{}")).toMatchObject({
    name: "beeper.message.sent",
    data: { messageId: "new-outgoing" },
  });
});
