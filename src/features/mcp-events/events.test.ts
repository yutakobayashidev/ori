import { randomBytes, createHmac } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import { mcpEventOutbox, mcpEventSubscriptions } from "../storage/schema";
import {
  subscribeMcpEvent,
  unsubscribeMcpEvent,
  enqueueBeeperMessageEvent,
  deliverMcpEvents,
  getBeeperWatchChats,
} from "./events.server";
import { callbackUrl, isPublicAddress, webhookHeaders, type WebhookSender } from "./webhook.server";
let database: AppDatabase;
let directory: string;
const now = Date.parse("2026-10-07T12:00:00Z");
const secret = `whsec_${Buffer.alloc(32, 42).toString("base64")}`;
const input = {
  name: "beeper.message.received",
  arguments: { chatIds: ["chat-b", "chat-a"] },
  delivery: { mode: "webhook", url: "https://callback.invalid/events", secret },
};
const message = {
  targetId: "target",
  accountId: "account",
  chatId: "chat-a",
  messageId: "message",
  observedAt: new Date(now + 1).toISOString(),
  excerpt: "Please review the document",
};
const verify: WebhookSender = async (_url, body) => ({
  status: 200,
  body: JSON.stringify({ challenge: JSON.parse(body).challenge }),
});
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "mcp-events-test-"));
  const key = join(directory, "key");
  writeFileSync(key, randomBytes(32).toString("base64"), { mode: 0o600 });
  vi.stubEnv("TWITTER_LITE_CREDENTIAL_KEY_FILE", key);
  database = openDatabase(":memory:");
});
afterEach(() => {
  database.$client.close();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
describe("persistent MCP event subscriptions", () => {
  it("verifies before saving, canonicalizes filters and encrypts secrets", async () => {
    const first = await subscribeMcpEvent(input, database, { now, sender: verify });
    const refreshed = await subscribeMcpEvent(
      { ...input, arguments: { chatIds: ["chat-a", "chat-b", "chat-a"] } },
      database,
      { now: now + 1000, sender: vi.fn<WebhookSender>() },
    );
    expect(refreshed.id).toBe(first.id);
    expect(database.select().from(mcpEventSubscriptions).all()).toHaveLength(1);
    expect(database.select().from(mcpEventSubscriptions).get()?.secretCiphertext).not.toContain(
      secret,
    );
    expect(getBeeperWatchChats(database, now)).toEqual([
      { chatId: "chat-a", startedAt: now },
      { chatId: "chat-b", startedAt: now },
    ]);
  });
  it("rejects invalid verification without activating a subscription", async () => {
    await expect(
      subscribeMcpEvent(input, database, {
        now,
        sender: async () => ({ status: 200, body: '{"challenge":"wrong"}' }),
      }),
    ).rejects.toMatchObject({ code: -32015, reason: "challenge_failed" });
    expect(getBeeperWatchChats(database, now)).toEqual([]);
  });
  it("honors expiry and unsubscribe discards outstanding deliveries", async () => {
    await subscribeMcpEvent({ ...input, ttlMs: 1000 }, database, { now, sender: verify });
    enqueueBeeperMessageEvent(message, database, now);
    expect(getBeeperWatchChats(database, now + 1001)).toEqual([]);
    unsubscribeMcpEvent(input, database);
    expect(database.select().from(mcpEventOutbox).all()).toEqual([]);
  });
  it("deduplicates message replay, excludes other chats, retries stable IDs and rotates signatures", async () => {
    await subscribeMcpEvent(input, database, { now, sender: verify });
    enqueueBeeperMessageEvent(message, database, now);
    enqueueBeeperMessageEvent(message, database, now);
    enqueueBeeperMessageEvent({ ...message, chatId: "other" }, database, now);
    expect(database.select().from(mcpEventOutbox).all()).toHaveLength(1);
    const sender = vi
      .fn<WebhookSender>()
      .mockResolvedValueOnce({ status: 503, body: "" })
      .mockResolvedValue({ status: 200, body: "" });
    expect(await deliverMcpEvents(database, { now, sender })).toEqual({
      attempted: 1,
      delivered: 0,
    });
    await subscribeMcpEvent(
      {
        ...input,
        delivery: { ...input.delivery, secret: `whsec_${Buffer.alloc(32, 5).toString("base64")}` },
      },
      database,
      { now: now + 1000, sender: verify },
    );
    expect(await deliverMcpEvents(database, { now: now + 5000, sender })).toEqual({
      attempted: 1,
      delivered: 1,
    });
    expect(sender.mock.calls[0]?.[1]).toBe(sender.mock.calls[1]?.[1]);
    expect(sender.mock.calls[1]?.[2]["webhook-signature"]?.split(" ")).toHaveLength(2);
  });
  it.each([410, 413, 400])("does not retry permanent HTTP %i failures", async (status) => {
    await subscribeMcpEvent(input, database, { now, sender: verify });
    enqueueBeeperMessageEvent(message, database, now);
    const sender = vi.fn<WebhookSender>().mockResolvedValue({ status, body: "" });
    await deliverMcpEvents(database, { now, sender });
    expect(await deliverMcpEvents(database, { now: now + 100000, sender })).toEqual({
      attempted: 0,
      delivered: 0,
    });
    expect(sender).toHaveBeenCalledTimes(1);
  });
  it("does not enqueue messages predating the subscription", async () => {
    await subscribeMcpEvent(input, database, { now, sender: verify });
    enqueueBeeperMessageEvent(
      { ...message, occurredAt: new Date(now - 1).toISOString() },
      database,
      now,
    );
    expect(database.select().from(mcpEventOutbox).all()).toEqual([]);
  });
});
describe("outbox recovery", () => {
  it("stops between callbacks on shutdown and leaves remaining events queued", async () => {
    await subscribeMcpEvent(input, database, { now, sender: verify });
    enqueueBeeperMessageEvent(message, database, now);
    enqueueBeeperMessageEvent({ ...message, messageId: "second" }, database, now);
    const controller = new AbortController();
    const sender = vi.fn<WebhookSender>().mockImplementation(async () => {
      controller.abort();
      return { status: 200, body: "" };
    });
    expect(await deliverMcpEvents(database, { now, sender, signal: controller.signal })).toEqual({
      attempted: 1,
      delivered: 1,
    });
    const queued = database
      .select()
      .from(mcpEventOutbox)
      .all()
      .filter((row) => !row.deliveredAt);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ attempts: 0, failedAt: null, nextAttemptAt: now });
    expect(await deliverMcpEvents(database, { now, sender, signal: controller.signal })).toEqual({
      attempted: 0,
      delivered: 0,
    });
  });
  it("rejects invalid signing secrets as input validation without contacting the callback", async () => {
    const sender = vi.fn<WebhookSender>();
    await expect(
      subscribeMcpEvent(
        { ...input, delivery: { ...input.delivery, secret: "invalid-private-secret" } },
        database,
        { now, sender },
      ),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(sender).not.toHaveBeenCalled();
    expect(database.select().from(mcpEventSubscriptions).all()).toEqual([]);
  });

  it("retains subscriptions and pending events across a database reopen", async () => {
    database.$client.close();
    const path = join(directory, "workspace.sqlite");
    database = openDatabase(path);
    await subscribeMcpEvent(input, database, { now, sender: verify });
    enqueueBeeperMessageEvent(message, database, now);
    database.$client.close();
    database = openDatabase(path);
    const sender = vi.fn<WebhookSender>().mockResolvedValue({ status: 200, body: "" });
    expect(await deliverMcpEvents(database, { now, sender })).toEqual({
      attempted: 1,
      delivered: 1,
    });
    expect(getBeeperWatchChats(database, now)).toHaveLength(2);
  });
  it("stops retrying after eight transient failures", async () => {
    await subscribeMcpEvent(input, database, { now, sender: verify });
    enqueueBeeperMessageEvent(message, database, now);
    const sender = vi.fn<WebhookSender>().mockResolvedValue({ status: 503, body: "" });
    for (let attempt = 0; attempt < 9; attempt++)
      await deliverMcpEvents(database, { now: now + attempt * 3_600_000, sender });
    expect(sender).toHaveBeenCalledTimes(8);
    expect(database.select().from(mcpEventOutbox).get()).toMatchObject({
      attempts: 8,
      lastError: "http_503",
      failedAt: now + 7 * 3_600_000,
    });
  });
  it("does not revive pre-expiry deliveries when a subscription is recreated", async () => {
    await subscribeMcpEvent({ ...input, ttlMs: 1000 }, database, { now, sender: verify });
    enqueueBeeperMessageEvent(message, database, now);
    await subscribeMcpEvent(input, database, { now: now + 2000, sender: verify });
    const sender = vi.fn<WebhookSender>();
    await deliverMcpEvents(database, { now: now + 2000, sender });
    expect(sender).not.toHaveBeenCalled();
  });
});
describe("signed public HTTPS delivery", () => {
  it("signs exact bytes using Standard Webhooks HMAC framing", () => {
    const headers = webhookHeaders("evt_1", "sub_1", '{"a":1}', [secret], now);
    const expected = createHmac("sha256", Buffer.alloc(32, 42))
      .update(`evt_1.${Math.floor(now / 1000)}.{"a":1}`)
      .digest("base64");
    expect(headers["webhook-signature"]).toBe(`v1,${expected}`);
  });
  it.each([
    "127.0.0.1",
    "10.1.1.1",
    "100.91.91.87",
    "169.254.169.254",
    "192.168.1.1",
    "198.18.0.1",
    "203.0.113.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "3fff::1",
  ])("blocks non-public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])(
    "permits global address %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
  it.each([
    "http://callback.invalid",
    "https://user:pass@callback.invalid",
    "https://callback.invalid:8443",
    "https://callback.invalid/#secret",
  ])("rejects invalid callback %s", (url) => {
    expect(() => callbackUrl(url)).toThrow("Webhook callback could not be verified or reached.");
  });
});
