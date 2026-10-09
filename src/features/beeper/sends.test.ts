// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  getActivityContext,
  publishActivities,
  updateActivityUser,
} from "../activities/repository.server";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import { beeperMessages, beeperMessageSends } from "../storage/schema";
import {
  getLatestActivitySend,
  processMessageSends,
  recoverInterruptedMessageSends,
  replyDraftHash,
  sendActivityReply,
} from "./sends.server";
import type { BeeperMessage, BeeperMessagingAdapter } from "./adapter.server";

let database: AppDatabase;
const conversation = { targetId: "um790", accountId: "work", chatId: "aoki" };
const body = "Monday works.";
const input = {
  requestId: "send-one",
  activityId: "reply",
  expectedRevision: 1,
  expectedDraftHash: replyDraftHash(body),
  conversation,
  replyToMessageId: "source-message",
};
const message: BeeperMessage = {
  id: "source-message",
  accountID: "work",
  chatID: "aoki",
  timestamp: "2026-10-09T00:00:00Z",
  text: "When?",
};
const adapter = {
  targetId: "um790",
  readChat: vi.fn<BeeperMessagingAdapter["readChat"]>(async () => ({
    id: "aoki",
    accountID: "work",
    title: "Aoki",
    imgURL: undefined,
    network: "Discord",
    type: "single",
    participants: { items: [] },
  })),
  retrieveMessage: vi.fn<BeeperMessagingAdapter["retrieveMessage"]>(async () => message),
  sendMessage: vi.fn<BeeperMessagingAdapter["sendMessage"]>(async () => ({
    chatID: "aoki",
    pendingMessageID: "pending",
  })),
};
beforeEach(() => {
  vi.resetAllMocks();
  adapter.readChat.mockResolvedValue({
    id: "aoki",
    accountID: "work",
    title: "Aoki",
    imgURL: undefined,
    network: "Discord",
    type: "single",
    participants: { items: [] },
  });
  adapter.retrieveMessage.mockResolvedValue(message);
  adapter.sendMessage.mockResolvedValue({ chatID: "aoki", pendingMessageID: "pending" });
  database = openDatabase(":memory:");
  publishActivities(
    {
      requestId: "publish",
      expectedRevision: 0,
      activities: [
        {
          id: "reply",
          kind: "reply",
          title: "Reply to Aoki",
          nextAction: "Suggest a time",
          sources: [
            {
              id: "source",
              kind: "message",
              provider: "beeper",
              ...conversation,
              messageId: "source-message",
              observedAt: message.timestamp,
              excerpt: "When?",
            },
          ],
          reply: { recipientName: "Aoki", sourceId: "source", context: "Meeting", draft: body },
        },
      ],
    },
    database,
  );
});
afterEach(() => database.$client.close());

it("freezes the reviewed draft, sends once, and waits for actual upstream success without completing the activity", async () => {
  const before = getActivityContext({}, database);
  const queued = await sendActivityReply(input, database, adapter);
  expect(queued).toMatchObject({ ok: true, operation: { state: "queued", body } });
  expect(adapter.sendMessage).not.toHaveBeenCalled();
  await processMessageSends(database, adapter);
  expect(getLatestActivitySend("reply", database)).toMatchObject({
    state: "accepted",
    pendingMessageId: "pending",
  });
  adapter.retrieveMessage.mockResolvedValue({ ...message, id: "pending", isSender: true });
  await processMessageSends(database, adapter);
  expect(getLatestActivitySend("reply", database)?.state).toBe("accepted");
  adapter.retrieveMessage.mockResolvedValue({
    ...message,
    id: "resolved",
    sendStatus: { status: "SUCCESS", timestamp: message.timestamp },
  });
  await processMessageSends(database, adapter);
  expect(getLatestActivitySend("reply", database)).toMatchObject({
    state: "succeeded",
    upstreamStatus: "SUCCESS",
    messageId: "resolved",
  });
  expect(
    database.select().from(beeperMessages).where(eq(beeperMessages.messageId, "resolved")).get()
      ?.data.sendStatus?.status,
  ).toBe("SUCCESS");
  expect(adapter.sendMessage).toHaveBeenCalledExactlyOnceWith("aoki", {
    text: body,
    replyToMessageID: "source-message",
  });
  expect(getActivityContext({}, database)).toEqual(before);
});

it("deduplicates retries before revision checks and rejects changed payloads or duplicate concurrent clicks", async () => {
  const results = await Promise.all([
    sendActivityReply(input, database, adapter),
    sendActivityReply({ ...input, requestId: "second-click" }, database, adapter),
  ]);
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(results.filter((result) => !result.ok)).toMatchObject([
    { error: { code: "idempotency-conflict" } },
  ]);
  updateActivityUser(
    { requestId: "edit", expectedRevision: 1, id: "reply", overrides: { draft: "Tuesday works." } },
    database,
  );
  expect(await sendActivityReply(input, database, adapter)).toEqual(results[0]);
  expect(
    await sendActivityReply({ ...input, replyToMessageId: null }, database, adapter),
  ).toMatchObject({ ok: false, error: { code: "idempotency-conflict" } });
});

it("rejects a changed draft or destination before enqueueing", async () => {
  expect(
    await sendActivityReply(
      { ...input, expectedDraftHash: replyDraftHash("unseen") },
      database,
      adapter,
    ),
  ).toMatchObject({ ok: false, error: { code: "revision-conflict" } });
  expect(
    await sendActivityReply(
      { ...input, conversation: { ...conversation, chatId: "elsewhere" } },
      database,
      adapter,
    ),
  ).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  adapter.retrieveMessage.mockResolvedValue({ ...message, chatID: "elsewhere" });
  expect(await sendActivityReply(input, database, adapter)).toMatchObject({
    ok: false,
    error: { code: "invalid-reply-target" },
  });
  expect(getLatestActivitySend("reply", database)).toBeNull();
});

it("rechecks revision after network validation so edits made during verification are never sent", async () => {
  adapter.readChat.mockImplementationOnce(async () => {
    updateActivityUser(
      { requestId: "edit", expectedRevision: 1, id: "reply", overrides: { draft: "Changed" } },
      database,
    );
    return {
      id: "aoki",
      accountID: "work",
      title: "Aoki",
      imgURL: undefined,
      network: "Discord",
      type: "single",
      participants: { items: [] },
    };
  });
  expect(await sendActivityReply(input, database, adapter)).toMatchObject({
    ok: false,
    error: { code: "revision-conflict" },
  });
  expect(getLatestActivitySend("reply", database)).toBeNull();
});

it("never retries a POST after timeout or restart during submission", async () => {
  await sendActivityReply(input, database, adapter);
  adapter.sendMessage.mockRejectedValueOnce(new Error("private diagnostic"));
  await processMessageSends(database, adapter);
  expect(getLatestActivitySend("reply", database)).toMatchObject({
    state: "unknown",
    errorCode: "submission-result-unknown",
  });
  await processMessageSends(database, adapter);
  expect(adapter.sendMessage).toHaveBeenCalledTimes(1);
  database
    .update(beeperMessageSends)
    .set({ state: "submitting" })
    .where(eq(beeperMessageSends.activityId, "reply"))
    .run();
  recoverInterruptedMessageSends(database);
  await processMessageSends(database, adapter);
  expect(getLatestActivitySend("reply", database)).toMatchObject({
    state: "unknown",
    errorCode: "submission-interrupted",
  });
  expect(adapter.sendMessage).toHaveBeenCalledTimes(1);
});

it("claims queued work atomically across overlapping worker ticks", async () => {
  await sendActivityReply(input, database, adapter);
  await Promise.all([
    processMessageSends(database, adapter),
    processMessageSends(database, adapter),
  ]);
  expect(adapter.sendMessage).toHaveBeenCalledTimes(1);
});

it("keeps bridge retries pending and records permanent failures without posting again", async () => {
  await sendActivityReply(input, database, adapter);
  await processMessageSends(database, adapter);
  adapter.retrieveMessage.mockResolvedValue({
    ...message,
    sendStatus: { status: "FAIL_RETRIABLE", timestamp: message.timestamp },
  });
  await processMessageSends(database, adapter);
  expect(getLatestActivitySend("reply", database)).toMatchObject({
    state: "accepted",
    upstreamStatus: "FAIL_RETRIABLE",
  });
  adapter.retrieveMessage.mockResolvedValue({
    ...message,
    sendStatus: { status: "FAIL_PERMANENT", timestamp: message.timestamp },
  });
  await processMessageSends(database, adapter);
  expect(getLatestActivitySend("reply", database)?.state).toBe("failed");
  expect(adapter.sendMessage).toHaveBeenCalledTimes(1);
});

it("rejects merged or read-only chats, including a chat that becomes read-only before submission", async () => {
  const chat = await adapter.readChat("aoki");
  adapter.readChat.mockResolvedValue({ ...chat, isReadOnly: true } as typeof chat);
  expect(await sendActivityReply(input, database, adapter)).toMatchObject({
    ok: false,
    error: { code: "conversation-not-writable" },
  });
  adapter.readChat.mockResolvedValue({
    ...chat,
    merge: { chatIDs: ["aoki", "other"] },
  } as typeof chat);
  expect(await sendActivityReply(input, database, adapter)).toMatchObject({
    ok: false,
    error: { code: "conversation-not-writable" },
  });
  adapter.readChat.mockResolvedValue(chat);
  await sendActivityReply(input, database, adapter);
  adapter.readChat.mockResolvedValue({ ...chat, isReadOnly: true } as typeof chat);
  await processMessageSends(database, adapter);
  expect(getLatestActivitySend("reply", database)).toMatchObject({
    state: "failed",
    errorCode: "conversation-not-writable",
  });
  expect(adapter.sendMessage).not.toHaveBeenCalled();
});

it("does not report success when Beeper routed the message to a different conversation", async () => {
  await sendActivityReply(input, database, adapter);
  adapter.sendMessage.mockResolvedValue({ chatID: "other", pendingMessageID: "pending" });
  await processMessageSends(database, adapter);
  expect(getLatestActivitySend("reply", database)).toMatchObject({
    state: "unknown",
    actualChatId: "other",
    errorCode: "unexpected-routing",
  });
  await processMessageSends(database, adapter);
  expect(adapter.sendMessage).toHaveBeenCalledTimes(1);
});

it("retains the frozen body even when the owner edits the draft after queueing", async () => {
  await sendActivityReply(input, database, adapter);
  updateActivityUser(
    {
      requestId: "edit",
      expectedRevision: 1,
      id: "reply",
      overrides: { draft: "A different message" },
    },
    database,
  );
  await processMessageSends(database, adapter);
  expect(adapter.sendMessage).toHaveBeenCalledExactlyOnceWith("aoki", {
    text: body,
    replyToMessageID: "source-message",
  });
  expect(
    await sendActivityReply(
      {
        ...input,
        requestId: "other",
        expectedRevision: 2,
        expectedDraftHash: replyDraftHash("A different message"),
      },
      database,
      adapter,
    ),
  ).toMatchObject({ ok: false, error: { code: "idempotency-conflict" } });
});

it("honors the numeric reply capability while permitting a normal message", async () => {
  const chat = await adapter.readChat("aoki");
  adapter.readChat.mockResolvedValue({ ...chat, capabilities: { reply: 0 } });
  expect(await sendActivityReply(input, database, adapter)).toMatchObject({
    ok: false,
    error: { code: "reply-not-supported" },
  });
  expect(
    await sendActivityReply({ ...input, replyToMessageId: null }, database, adapter),
  ).toMatchObject({ ok: true, operation: { replyToMessageId: null } });
});
