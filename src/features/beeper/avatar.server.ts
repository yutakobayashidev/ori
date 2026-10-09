import { getActivityContext } from "../activities/repository.server";
import { getDatabase } from "../storage/database.server";
import { createBeeperAdapter, type BeeperMessagingAdapter } from "./adapter.server";
import { readActivityConversationInput } from "./conversation-model";
import { getBeeperAsset, rememberBeeperAsset } from "./media.server";

export async function readActivityAvatar(
  input: unknown,
  database = getDatabase(),
  adapter: BeeperMessagingAdapter = createBeeperAdapter(),
): Promise<{ dataUrl: string | null }> {
  try {
    const { activityId } = readActivityConversationInput.pick({ activityId: true }).parse(input);
    const activity = getActivityContext({ activityIds: [activityId] }, database).activities[0]
      ?.effective;
    if (!activity || activity.kind !== "reply") return { dataUrl: null };
    const source = activity.sources.find((item) => item.id === activity.reply.sourceId);
    if (!source || source.kind !== "message" || source.targetId !== adapter.targetId)
      return { dataUrl: null };
    const chat = await adapter.readChat(source.chatId);
    if (chat.id !== source.chatId || chat.accountID !== source.accountId || chat.merge)
      return { dataUrl: null };
    let sourceUri =
      chat.imgURL ||
      (chat.type === "single"
        ? chat.participants.items.find((member) => !member.isSelf && member.imgURL)?.imgURL
        : undefined);
    if (!sourceUri && chat.type !== "single") {
      const message = await adapter.retrieveMessage(source.chatId, source.messageId);
      if (
        message.id !== source.messageId ||
        message.chatID !== source.chatId ||
        message.accountID !== source.accountId
      )
        return { dataUrl: null };
      sourceUri = chat.participants.items.find((member) => member.id === message.senderID)?.imgURL;
    }
    const assetId = rememberBeeperAsset(source.targetId, sourceUri, database);
    if (!assetId) return { dataUrl: null };
    const { dataUrl } = await getBeeperAsset({ assetId }, database, adapter);
    return { dataUrl };
  } catch {
    return { dataUrl: null };
  }
}
