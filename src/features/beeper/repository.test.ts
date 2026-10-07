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
