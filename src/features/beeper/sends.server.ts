import { cacheBeeperMessage } from "./message-cache.server";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getActivityContext } from "../activities/repository.server";
import { getDatabase } from "../storage/database.server";
import { beeperMessageSends } from "../storage/schema";
import { createBeeperAdapter, type BeeperMessagingAdapter } from "./adapter.server";
import {
  getMessageSendInput,
  sendActivityReplyInput,
  type MessageSendOperation,
  type MessageSendResult,
} from "./sends-model";

export const replyDraftHash = (body: string) => createHash("sha256").update(body).digest("hex");
const failure = (code: string, message: string): MessageSendResult => ({
  ok: false,
  error: { code, message },
});
function publicOperation(row: typeof beeperMessageSends.$inferSelect): MessageSendOperation {
  return {
    id: row.id,
    activityId: row.activityId,
    targetId: row.targetId,
    accountId: row.accountId,
    chatId: row.chatId,
    actualChatId: row.actualChatId,
    body: row.body,
    replyToMessageId: row.replyToMessageId,
    draftHash: row.draftHash,
    expectedRevision: row.expectedRevision,
    state: row.state,
    pendingMessageId: row.pendingMessageId,
    messageId: row.messageId,
    errorCode: row.errorCode,
    upstreamStatus: row.upstreamStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
export function getMessageSend(input: unknown, database = getDatabase()): MessageSendResult {
  const parsed = getMessageSendInput.safeParse(input);
  if (!parsed.success) return failure("invalid-input", "Choose a send operation.");
  const row = database
    .select()
    .from(beeperMessageSends)
    .where(eq(beeperMessageSends.id, parsed.data.operationId))
    .get();
  return row
    ? { ok: true, operation: publicOperation(row) }
    : failure("not-found", "Send operation not found.");
}
export function getLatestActivitySend(
  activityId: string,
  database = getDatabase(),
): MessageSendOperation | null {
  const row = database
    .select()
    .from(beeperMessageSends)
    .where(eq(beeperMessageSends.activityId, activityId))
    .orderBy(desc(beeperMessageSends.createdAt), desc(beeperMessageSends.id))
    .get();
  return row ? publicOperation(row) : null;
}

type SendingAdapter = Pick<
  BeeperMessagingAdapter,
  "targetId" | "readChat" | "retrieveMessage" | "sendMessage"
>;
async function validateDestination(
  adapter: SendingAdapter,
  conversation: { targetId: string; accountId: string; chatId: string },
  body: string,
  replyToMessageId: string | null,
) {
  if (adapter.targetId !== conversation.targetId) return "wrong-target";
  const chat = await adapter.readChat(conversation.chatId);
  if (chat.id !== conversation.chatId || chat.accountID !== conversation.accountId)
    return "wrong-conversation";
  if (chat.isReadOnly || chat.merge) return "conversation-not-writable";
  if (
    chat.capabilities?.maxTextLength !== undefined &&
    body.length > chat.capabilities.maxTextLength
  )
    return "message-too-long";
  if (replyToMessageId) {
    if (chat.capabilities?.reply !== undefined && chat.capabilities.reply <= 0)
      return "reply-not-supported";
    const message = await adapter.retrieveMessage(conversation.chatId, replyToMessageId);
    if (
      message.chatID !== conversation.chatId ||
      message.accountID !== conversation.accountId ||
      message.id !== replyToMessageId ||
      message.isDeleted
    )
      return "invalid-reply-target";
  }
  return null;
}

export async function sendActivityReply(
  input: unknown,
  database = getDatabase(),
  adapter: SendingAdapter = createBeeperAdapter(),
): Promise<MessageSendResult> {
  const parsed = sendActivityReplyInput.safeParse(input);
  if (!parsed.success)
    return failure("invalid-input", "Check the draft, conversation and revision.");
  const value = parsed.data;
  const payloadHash = replyDraftHash(JSON.stringify(value));
  const existing = database
    .select()
    .from(beeperMessageSends)
    .where(eq(beeperMessageSends.requestId, value.requestId))
    .get();
  if (existing)
    return existing.payloadHash === payloadHash
      ? { ok: true, operation: publicOperation(existing) }
      : failure("idempotency-conflict", "This request ID was already used for a different send.");
  const context = getActivityContext({ activityIds: [value.activityId] }, database);
  const activity = context.activities[0]?.effective;
  if (context.revision !== value.expectedRevision)
    return failure("revision-conflict", "The activity changed. Review it before sending.");
  if (!activity || activity.kind !== "reply")
    return failure("invalid-input", "Choose a reply activity.");
  const source = activity.sources.find((entry) => entry.id === activity.reply.sourceId);
  if (
    !source ||
    source.kind !== "message" ||
    source.targetId !== value.conversation.targetId ||
    source.accountId !== value.conversation.accountId ||
    source.chatId !== value.conversation.chatId
  )
    return failure("invalid-input", "The conversation must match the reply's source.");
  const body = activity.reply.draft ?? "";
  if (!body.trim() || replyDraftHash(body) !== value.expectedDraftHash)
    return failure("revision-conflict", "The reply draft changed. Review it before sending.");
  try {
    const problem = await validateDestination(
      adapter,
      value.conversation,
      body,
      value.replyToMessageId,
    );
    if (problem)
      return failure(problem, "This conversation or reply target cannot be used for sending.");
  } catch {
    return failure(
      "beeper-unavailable",
      "Could not verify the Beeper conversation. Nothing was queued.",
    );
  }
  return database.transaction(
    (): MessageSendResult => {
      const duplicate = database
        .select()
        .from(beeperMessageSends)
        .where(eq(beeperMessageSends.requestId, value.requestId))
        .get();
      if (duplicate)
        return duplicate.payloadHash === payloadHash
          ? { ok: true, operation: publicOperation(duplicate) }
          : failure(
              "idempotency-conflict",
              "This request ID was already used for a different send.",
            );
      if (
        getActivityContext({ activityIds: [value.activityId] }, database).revision !==
        value.expectedRevision
      )
        return failure("revision-conflict", "The activity changed. Review it before sending.");
      const prior = database
        .select()
        .from(beeperMessageSends)
        .where(eq(beeperMessageSends.activityId, value.activityId))
        .all();
      if (
        prior.some(
          (row) =>
            ["queued", "submitting", "accepted", "unknown"].includes(row.state) ||
            (row.expectedRevision === value.expectedRevision &&
              row.draftHash === value.expectedDraftHash),
        )
      )
        return failure(
          "idempotency-conflict",
          "This reply already has a send operation. Check its status before sending again.",
        );
      const now = Date.now();
      const row = database
        .insert(beeperMessageSends)
        .values({
          id: randomUUID(),
          requestId: value.requestId,
          payloadHash,
          activityId: value.activityId,
          ...value.conversation,
          body,
          replyToMessageId: value.replyToMessageId,
          draftHash: value.expectedDraftHash,
          expectedRevision: value.expectedRevision,
          state: "queued",
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      return { ok: true, operation: publicOperation(row) };
    },
    { behavior: "immediate" },
  );
}

// Only the single events worker invokes recovery at startup, before claiming new work.
export function recoverInterruptedMessageSends(database = getDatabase()) {
  database
    .update(beeperMessageSends)
    .set({ state: "unknown", errorCode: "submission-interrupted", updatedAt: Date.now() })
    .where(eq(beeperMessageSends.state, "submitting"))
    .run();
}
export async function processMessageSends(
  database = getDatabase(),
  adapter: SendingAdapter = createBeeperAdapter(),
) {
  const rows = database
    .select()
    .from(beeperMessageSends)
    .where(inArray(beeperMessageSends.state, ["queued", "accepted"]))
    .all();
  for (const row of rows) {
    if (row.targetId !== adapter.targetId) continue;
    const update = (
      values: Partial<typeof beeperMessageSends.$inferInsert>,
      expectedState = row.state,
    ) =>
      database
        .update(beeperMessageSends)
        .set({ ...values, updatedAt: Date.now() })
        .where(and(eq(beeperMessageSends.id, row.id), eq(beeperMessageSends.state, expectedState)))
        .run();
    if (row.state === "queued") {
      try {
        const problem = await validateDestination(adapter, row, row.body, row.replyToMessageId);
        if (problem) {
          update({ state: "failed", errorCode: problem });
          continue;
        }
      } catch {
        continue;
      } // No POST yet: observation can safely be retried.
      const claimed = database
        .update(beeperMessageSends)
        .set({ state: "submitting", updatedAt: Date.now() })
        .where(and(eq(beeperMessageSends.id, row.id), eq(beeperMessageSends.state, "queued")))
        .run();
      if (!claimed.changes) continue;
      try {
        const result = await adapter.sendMessage(row.chatId, {
          text: row.body,
          ...(row.replyToMessageId ? { replyToMessageID: row.replyToMessageId } : {}),
        });
        update(
          {
            state: result.chatID === row.chatId ? "accepted" : "unknown",
            actualChatId: result.chatID,
            pendingMessageId: result.pendingMessageID,
            errorCode: result.chatID === row.chatId ? null : "unexpected-routing",
          },
          "submitting",
        );
      } catch {
        update({ state: "unknown", errorCode: "submission-result-unknown" }, "submitting");
      }
    } else if (row.pendingMessageId && row.actualChatId === row.chatId) {
      try {
        const message = await adapter.retrieveMessage(row.chatId, row.pendingMessageId);
        if (
          message.chatID !== row.chatId ||
          message.accountID !== row.accountId ||
          message.isSender === false
        ) {
          update({ state: "unknown", errorCode: "unexpected-message" });
          continue;
        }
        cacheBeeperMessage(
          { targetId: row.targetId, accountId: row.accountId, chatId: row.chatId },
          message,
          database,
        );
        if (message.sendStatus) update({ upstreamStatus: message.sendStatus.status });
        if (message.sendStatus?.status === "SUCCESS")
          update({ state: "succeeded", messageId: message.id, errorCode: null });
        else if (message.sendStatus?.status === "FAIL_PERMANENT")
          update({ state: "failed", messageId: message.id, errorCode: "upstream-send-failed" });
        // PENDING, retriable bridge failure and missing status never trigger another POST.
      } catch {
        /* Keep accepted until an authoritative status can be read. */
      }
    }
  }
}
