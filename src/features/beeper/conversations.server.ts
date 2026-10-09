import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getActivityContext } from "../activities/repository.server";
import { getDatabase } from "../storage/database.server";
import { beeperConversations } from "../storage/schema";
import { createBeeperAdapter, type BeeperMessagingAdapter } from "./adapter.server";
import {
  BeeperConversationError,
  readActivityConversationInput,
  type Conversation,
  type ConversationMessage,
} from "./conversation-model";
import { cacheBeeperMessage } from "./message-cache.server";
import { rememberBeeperAsset } from "./media.server";
import { replyDraftHash } from "./sends.server";

export async function readActivityConversation(
  input: unknown,
  database = getDatabase(),
  adapter: BeeperMessagingAdapter = createBeeperAdapter(),
) {
  const parsed = readActivityConversationInput.safeParse(input);
  if (!parsed.success)
    throw new BeeperConversationError("invalid-input", "Choose an activity and a valid cursor.");
  const { activityId, cursor, sourceId } = parsed.data;
  const context = getActivityContext({ activityIds: [activityId] }, database);
  const activity = context.activities[0]?.effective;
  if (!activity || (!sourceId && activity.kind !== "reply"))
    throw new BeeperConversationError("not-found", "Reply activity not found.");
  const selectedSourceId =
    sourceId ?? (activity.kind === "reply" ? activity.reply.sourceId : undefined);
  const source = activity.sources.find((item) => item.id === selectedSourceId);
  if (!source || source.kind !== "message" || source.targetId !== adapter.targetId)
    throw new BeeperConversationError(
      "invalid-conversation",
      "The conversation is not available on this Beeper connection.",
    );
  try {
    const anchor = sourceId
      ? await adapter.retrieveMessage(source.chatId, source.messageId)
      : undefined;
    if (
      anchor &&
      (anchor.id !== source.messageId ||
        anchor.chatID !== source.chatId ||
        anchor.accountID !== source.accountId)
    )
      throw new BeeperConversationError(
        "invalid-conversation",
        "Beeper returned a different source message.",
      );
    if (anchor?.isHidden)
      throw new BeeperConversationError("not-found", "The source message is no longer available.");
    const [chat, page] = await Promise.all([
      adapter.readChat(source.chatId),
      adapter.readMessages(source.chatId, cursor, "before"),
    ]);
    const upstreamMessages = [
      ...new Map(
        [...page.items, ...(anchor ? [anchor] : [])].map((message) => [message.id, message]),
      ).values(),
    ];
    if (
      chat.id !== source.chatId ||
      chat.accountID !== source.accountId ||
      chat.merge ||
      upstreamMessages.some(
        (message) => message.chatID !== source.chatId || message.accountID !== source.accountId,
      )
    )
      throw new BeeperConversationError(
        "invalid-conversation",
        "Beeper returned a different conversation.",
      );
    const observedAt = Date.now();
    const key = createHash("sha256")
      .update(JSON.stringify([source.targetId, source.accountId, source.chatId]))
      .digest("hex");
    const previous = database
      .select()
      .from(beeperConversations)
      .where(eq(beeperConversations.id, key))
      .get()?.data;
    const participants = new Map(
      chat.participants.hasMore ? previous?.participants.map((member) => [member.id, member]) : [],
    );
    for (const member of chat.participants.items)
      participants.set(member.id, {
        id: member.id,
        fullName: member.fullName,
        isSelf: member.isSelf,
        avatarId: rememberBeeperAsset(source.targetId, member.imgURL, database),
      });
    const conversation: Conversation = {
      targetId: source.targetId,
      accountId: source.accountId,
      chatId: source.chatId,
      title: chat.title,
      network: chat.network,
      type: chat.type,
      participants: [...participants.values()],
      avatarId: rememberBeeperAsset(source.targetId, chat.imgURL, database),
      isReadOnly: chat.isReadOnly,
      capabilities: chat.capabilities,
      isMerged: false,
    };
    const messages: ConversationMessage[] = [];
    database.transaction((tx) => {
      tx.insert(beeperConversations)
        .values({
          id: key,
          targetId: source.targetId,
          accountId: source.accountId,
          chatId: source.chatId,
          data: conversation,
          observedAt,
        })
        .onConflictDoUpdate({
          target: beeperConversations.id,
          set: { data: conversation, observedAt },
        })
        .run();
      for (const message of upstreamMessages) {
        const cached = cacheBeeperMessage(
          { targetId: source.targetId, accountId: source.accountId, chatId: source.chatId },
          message,
          tx,
        );
        if (cached) messages.push(cached);
      }
    });
    messages.sort(
      (a, b) =>
        Date.parse(a.timestamp) - Date.parse(b.timestamp) ||
        (a.sortKey ?? a.id).localeCompare(b.sortKey ?? b.id, "en", { numeric: true }),
    );
    return {
      ok: true as const,
      conversation,
      messages,
      nextCursor: page.hasMore ? page.oldestCursor : null,
      revision: context.revision,
      draftHash: replyDraftHash(activity.kind === "reply" ? (activity.reply.draft ?? "") : ""),
      ...(anchor
        ? {
            focusedMessageId: anchor.id,
            focusedMessageOutsidePage: !page.items.some((message) => message.id === anchor.id),
          }
        : {}),
    };
  } catch (error) {
    if (error instanceof BeeperConversationError) throw error;
    throw new BeeperConversationError(
      "beeper-unavailable",
      "The conversation could not be loaded. Try again.",
    );
  }
}

export function activityHasAsset(activityId: string, assetId: string, database = getDatabase()) {
  const activity = getActivityContext({ activityIds: [activityId] }, database).activities[0]
    ?.effective;
  if (!activity) return false;
  return activity.sources.some((source) => {
    if (source.kind !== "message") return false;
    const key = createHash("sha256")
      .update(JSON.stringify([source.targetId, source.accountId, source.chatId]))
      .digest("hex");
    const conversation = database
      .select()
      .from(beeperConversations)
      .where(eq(beeperConversations.id, key))
      .get()?.data;
    return Boolean(
      conversation &&
      (conversation.avatarId === assetId ||
        conversation.participants.some((member) => member.avatarId === assetId)),
    );
  });
}
