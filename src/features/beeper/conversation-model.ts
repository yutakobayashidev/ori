import { z } from "zod";
import type { BeeperMessage } from "./adapter.server";

export const readActivityConversationInput = z.strictObject({
  activityId: z.string().min(1).max(128),
  cursor: z.string().max(4096).optional(),
});
export const getBeeperAssetInput = z.strictObject({ assetId: z.string().regex(/^[a-f0-9]{64}$/) });
export type Conversation = {
  targetId: string;
  accountId: string;
  chatId: string;
  title: string;
  network: string;
  type: string;
  participants: { id: string; fullName?: string; isSelf?: boolean; avatarId?: string }[];
  avatarId?: string;
  isReadOnly?: boolean;
  capabilities?: { maxTextLength?: number; reply?: number };
  isMerged: boolean;
};
export type ConversationMessage = {
  id: string;
  senderId?: string;
  senderName?: string;
  isSender?: boolean;
  text?: string;
  type?: string;
  linkedMessageId?: string;
  timestamp: string;
  sortKey?: string;
  isDeleted?: boolean;
  editedTimestamp?: string;
  sendStatus?: BeeperMessage["sendStatus"];
};
export class BeeperConversationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BeeperConversationError";
  }
}
