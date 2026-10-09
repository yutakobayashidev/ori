import { getActivityContext } from "../activities/repository.server";
import { getDatabase } from "../storage/database.server";
import { createBeeperAdapter, type BeeperMessagingAdapter } from "./adapter.server";
import { readActivityConversationInput } from "./conversation-model";
import { getBeeperAsset, rememberBeeperAsset } from "./media.server";

export async function readActivityAvatar(
  input: unknown,
  database = getDatabase(),
  adapter: BeeperMessagingAdapter = createBeeperAdapter(),
): Promise<{ dataUrl: string | null; title?: string; type?: string; network?: string }> {
  let preview: { dataUrl: string | null; title?: string; type?: string; network?: string } = {
    dataUrl: null,
  };
  try {
    const { activityId } = readActivityConversationInput.pick({ activityId: true }).parse(input);
    const activity = getActivityContext({ activityIds: [activityId] }, database).activities[0]
      ?.effective;
    if (!activity || activity.kind !== "reply") return preview;
    const source = activity.sources.find((item) => item.id === activity.reply.sourceId);
    if (!source || source.kind !== "message" || source.targetId !== adapter.targetId)
      return preview;
    const chat = await adapter.readChat(source.chatId);
    if (chat.id !== source.chatId || chat.accountID !== source.accountId || chat.merge)
      return preview;
    preview = { dataUrl: null, title: chat.title, type: chat.type, network: chat.network };
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
        return preview;
      sourceUri = chat.participants.items.find((member) => member.id === message.senderID)?.imgURL;
    }
    const assetId = rememberBeeperAsset(source.targetId, sourceUri, database);
    if (!assetId) return preview;
    const { dataUrl } = await getBeeperAsset({ assetId }, database, adapter);
    return { ...preview, dataUrl };
  } catch {
    return preview;
  }
}
