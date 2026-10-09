import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDatabase, type AppDatabase } from "../storage/database.server";
import { beeperMessages } from "../storage/schema";
import type { BeeperMessage } from "./adapter.server";
import type { ConversationMessage } from "./conversation-model";

export function cacheBeeperMessage(
  conversation: { targetId: string; accountId: string; chatId: string },
  message: BeeperMessage,
  database: Pick<AppDatabase, "insert" | "delete"> = getDatabase(),
): ConversationMessage | null {
  if (message.accountID !== conversation.accountId || message.chatID !== conversation.chatId)
    throw new Error("Message conversation mismatch.");
  const key = createHash("sha256")
    .update(JSON.stringify([conversation.targetId, conversation.accountId, conversation.chatId]))
    .digest("hex");
  const id = createHash("sha256")
    .update(JSON.stringify([key, message.id]))
    .digest("hex");
  if (message.isHidden) {
    database.delete(beeperMessages).where(eq(beeperMessages.id, id)).run();
    return null;
  }
  const data: ConversationMessage = {
    id: message.id,
    senderId: message.senderID,
    senderName: message.senderName,
    isSender: message.isSender,
    text: message.isDeleted ? undefined : message.text,
    type: message.type,
    linkedMessageId: message.linkedMessageID,
    timestamp: message.timestamp,
    sortKey: message.sortKey,
    isDeleted: message.isDeleted,
    editedTimestamp: message.editedTimestamp,
    sendStatus: message.sendStatus,
  };
  const observedAt = Date.now();
  database
    .insert(beeperMessages)
    .values({
      id,
      targetId: conversation.targetId,
      accountId: conversation.accountId,
      chatId: conversation.chatId,
      messageId: message.id,
      data,
      observedAt,
    })
    .onConflictDoUpdate({ target: beeperMessages.id, set: { data, observedAt } })
    .run();
  return data;
}
