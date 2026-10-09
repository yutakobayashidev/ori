// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { publishActivities } from "../activities/repository.server";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import { beeperMessages } from "../storage/schema";
import type { BeeperMessagingAdapter } from "./adapter.server";
import { activityHasAsset, readActivityConversation } from "./conversations.server";
import { getBeeperAsset, rememberBeeperAsset } from "./media.server";
let database: AppDatabase;
let adapter: BeeperMessagingAdapter;
const chat = {
  id: "chat",
  accountID: "account",
  title: "Alice",
  network: "Discord",
  type: "single",
  participants: { items: [{ id: "alice", fullName: "Alice", imgURL: "mxc://host/avatar" }] },
  capabilities: { reply: 2 },
};
const message = {
  id: "msg",
  chatID: "chat",
  accountID: "account",
  timestamp: "2026-10-09T00:00:00Z",
  senderID: "alice",
  text: "Hello",
};
beforeEach(() => {
  database = openDatabase(":memory:");
  publishActivities(
    {
      requestId: "publish",
      expectedRevision: 0,
      activities: [
        {
          id: "reply",
          kind: "reply",
          title: "Reply Alice",
          nextAction: "Respond",
          sources: [
            {
              id: "source",
              kind: "message",
              provider: "beeper",
              targetId: "test",
              accountId: "account",
              chatId: "chat",
              messageId: "msg",
              observedAt: message.timestamp,
              excerpt: "Hello",
            },
          ],
          reply: { recipientName: "Alice", sourceId: "source", context: "Say hello", draft: "Hi" },
        },
      ],
    },
    database,
  );
  adapter = {
    targetId: "test",
    listChats: vi.fn<BeeperMessagingAdapter["listChats"]>(),
    watch: vi.fn<BeeperMessagingAdapter["watch"]>(),
    readChat: vi.fn<BeeperMessagingAdapter["readChat"]>().mockResolvedValue(chat),
    readMessages: vi.fn<BeeperMessagingAdapter["readMessages"]>().mockResolvedValue({
      items: [message],
      hasMore: true,
      oldestCursor: "older",
      newestCursor: "newer",
    }),
    retrieveMessage: vi.fn<BeeperMessagingAdapter["retrieveMessage"]>(),
    sendMessage: vi.fn<BeeperMessagingAdapter["sendMessage"]>(),
    readMedia: vi
      .fn<BeeperMessagingAdapter["readMedia"]>()
      .mockResolvedValue(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])),
  };
});
afterEach(() => database.$client.close());
it("returns authoritative identities, opaque avatar references, cursor and matching draft snapshot", async () => {
  const result = await readActivityConversation({ activityId: "reply" }, database, adapter);
  expect(result).toMatchObject({
    ok: true,
    revision: 1,
    nextCursor: "older",
    conversation: {
      participants: [{ id: "alice", fullName: "Alice", avatarId: expect.any(String) }],
    },
    messages: [{ id: "msg", senderId: "alice" }],
    draftHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(result.messages[0]?.isSender).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain("mxc://");
  expect(
    activityHasAsset("reply", result.conversation.participants[0]?.avatarId ?? "", database),
  ).toBe(true);
  expect(activityHasAsset("reply", "unrelated", database)).toBe(false);
});
it("updates an existing message when deletion or send status changes", async () => {
  await readActivityConversation({ activityId: "reply" }, database, adapter);
  vi.mocked(adapter.readMessages).mockResolvedValue({
    items: [
      {
        ...message,
        isDeleted: true,
        sendStatus: { status: "SUCCESS", timestamp: message.timestamp },
      },
    ],
    hasMore: false,
    oldestCursor: null,
    newestCursor: null,
  });
  await readActivityConversation({ activityId: "reply" }, database, adapter);
  const rows = database.select().from(beeperMessages).all();
  expect(rows).toHaveLength(1);
  expect(rows[0]?.data).toMatchObject({ isDeleted: true, sendStatus: { status: "SUCCESS" } });
  expect(rows[0]?.data.text).toBeUndefined();
});
it("rejects target/account mismatches before caching or exposing messages", async () => {
  await expect(
    readActivityConversation({ activityId: "reply" }, database, { ...adapter, targetId: "wrong" }),
  ).rejects.toMatchObject({ code: "invalid-conversation" });
  expect(adapter.readChat).not.toHaveBeenCalled();
  vi.mocked(adapter.readChat).mockResolvedValue({ ...chat, accountID: "wrong" });
  await expect(
    readActivityConversation({ activityId: "reply" }, database, adapter),
  ).rejects.toMatchObject({ code: "invalid-conversation" });
  expect(database.select().from(beeperMessages).all()).toEqual([]);
});
it("preserves omitted participants in partial upstream membership pages", async () => {
  await readActivityConversation({ activityId: "reply" }, database, adapter);
  vi.mocked(adapter.readChat).mockResolvedValue({
    ...chat,
    participants: { items: [{ id: "bob" }], hasMore: true },
  });
  const result = await readActivityConversation({ activityId: "reply" }, database, adapter);
  expect(result.conversation.participants.map((member) => member.id)).toEqual(["alice", "bob"]);
});
it("loads only registered target-scoped avatars and rejects non-image contents", async () => {
  const assetId = rememberBeeperAsset("test", "mxc://host/unique-image", database);
  expect(await getBeeperAsset({ assetId }, database, adapter)).toMatchObject({
    ok: true,
    dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
  });
  await expect(
    getBeeperAsset({ assetId }, database, { ...adapter, targetId: "wrong" }),
  ).rejects.toMatchObject({ code: "not-found" });
  const malicious = rememberBeeperAsset("test", "file:///known/nonimage", database);
  vi.mocked(adapter.readMedia).mockResolvedValue(Buffer.from("secret-not-an-image"));
  await expect(getBeeperAsset({ assetId: malicious }, database, adapter)).rejects.toMatchObject({
    code: "beeper-unavailable",
  });
});
it("rejects private remote hosts without contacting the host", async () => {
  const assetId = rememberBeeperAsset("test", "https://127.0.0.1/private.png", database);
  await expect(getBeeperAsset({ assetId }, database, adapter)).rejects.toMatchObject({
    code: "beeper-unavailable",
  });
  expect(adapter.readMedia).not.toHaveBeenCalled();
});
it("rejects unknown avatar IDs without fetching anything", async () => {
  await expect(
    getBeeperAsset({ assetId: "a".repeat(64) }, database, adapter),
  ).rejects.toMatchObject({ code: "not-found" });
  expect(adapter.readMedia).not.toHaveBeenCalled();
});
it("rejects oversized avatars and executable SVG content", async () => {
  const large = rememberBeeperAsset("test", "mxc://host/oversized", database);
  vi.mocked(adapter.readMedia).mockResolvedValue(Buffer.alloc(2 * 1024 * 1024 + 1));
  await expect(getBeeperAsset({ assetId: large }, database, adapter)).rejects.toMatchObject({
    code: "beeper-unavailable",
  });
  const svg = rememberBeeperAsset("test", "mxc://host/svg", database);
  vi.mocked(adapter.readMedia).mockResolvedValue(
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  );
  await expect(getBeeperAsset({ assetId: svg }, database, adapter)).rejects.toMatchObject({
    code: "beeper-unavailable",
  });
});
it("requires inline avatar MIME type to match its raster signature", async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString("base64");
  const mismatch = rememberBeeperAsset("test", `data:image/jpeg;base64,${png}`, database);
  await expect(getBeeperAsset({ assetId: mismatch }, database, adapter)).rejects.toMatchObject({
    code: "beeper-unavailable",
  });
  const valid = rememberBeeperAsset("test", `data:image/png;base64,${png}`, database);
  expect(await getBeeperAsset({ assetId: valid }, database, adapter)).toEqual({
    ok: true,
    dataUrl: `data:image/png;base64,${png}`,
  });
  expect(adapter.readMedia).not.toHaveBeenCalled();
});
it("normalizes absolute paths from registered upstream metadata for Beeper media transport", async () => {
  const assetId = rememberBeeperAsset("test", "/beeper-cache/known avatar.png", database);
  await getBeeperAsset({ assetId }, database, adapter);
  expect(adapter.readMedia).toHaveBeenCalledWith("file:///beeper-cache/known%20avatar.png");
});
it("orders recent history oldest first and removes newly hidden messages from cache", async () => {
  vi.mocked(adapter.readMessages).mockResolvedValue({
    items: [{ ...message, id: "new", timestamp: "2026-10-09T01:00:00Z" }, message],
    hasMore: false,
    oldestCursor: null,
    newestCursor: null,
  });
  const result = await readActivityConversation({ activityId: "reply" }, database, adapter);
  expect(result.messages.map((item) => item.id)).toEqual(["msg", "new"]);
  vi.mocked(adapter.readMessages).mockResolvedValue({
    items: [{ ...message, isHidden: true }],
    hasMore: false,
    oldestCursor: null,
    newestCursor: null,
  });
  expect(
    (await readActivityConversation({ activityId: "reply" }, database, adapter)).messages,
  ).toEqual([]);
  expect(
    database
      .select()
      .from(beeperMessages)
      .all()
      .map((row) => row.messageId),
  ).toEqual(["new"]);
});
