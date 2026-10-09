import type { z } from "zod";
import type { Conversation, ConversationMessage } from "#/features/beeper/conversation-model";
import type {
  MessageSendOperation,
  MessageSendResult,
  sendActivityReplyInput,
} from "#/features/beeper/sends-model";

export type ConversationSnapshot = {
  ok: true;
  conversation: Conversation;
  messages: ConversationMessage[];
  nextCursor: string | null;
  focusedMessageId?: string;
  focusedMessageOutsidePage?: boolean;
  draftHash: string;
  revision: number;
  latestSend?: MessageSendOperation | null;
};
type Failure = { ok: false; error: { code: string; message: string } };
export type ActivityMessagingTransport = {
  readConversation(input: {
    activityId: string;
    cursor?: string;
    sourceId?: string;
  }): Promise<ConversationSnapshot | Failure>;
  sendReply(input: z.input<typeof sendActivityReplyInput>): Promise<MessageSendResult>;
  getSend(input: { operationId: string }): Promise<MessageSendResult>;
  getAsset(input: { assetId: string }): Promise<{ ok: true; dataUrl: string } | Failure>;
};
