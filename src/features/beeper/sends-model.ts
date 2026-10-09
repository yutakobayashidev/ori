import { z } from "zod";

const id = z.string().min(1).max(256);
export const sendActivityReplyInput = z.strictObject({
  requestId: id,
  activityId: id,
  expectedRevision: z.number().int().nonnegative(),
  expectedDraftHash: z.string().regex(/^[a-f0-9]{64}$/),
  conversation: z.strictObject({ targetId: id, accountId: id, chatId: id }),
  replyToMessageId: id.nullable().default(null),
});
export const getMessageSendInput = z.strictObject({ operationId: id });
export type MessageSendState =
  | "queued"
  | "submitting"
  | "accepted"
  | "succeeded"
  | "failed"
  | "unknown";
export type MessageSendOperation = {
  id: string;
  activityId: string;
  targetId: string;
  accountId: string;
  chatId: string;
  actualChatId: string | null;
  body: string;
  replyToMessageId: string | null;
  draftHash: string;
  expectedRevision: number;
  state: MessageSendState;
  pendingMessageId: string | null;
  messageId: string | null;
  errorCode: string | null;
  upstreamStatus: string | null;
  createdAt: number;
  updatedAt: number;
};
export type MessageSendFailure = { ok: false; error: { code: string; message: string } };
export type MessageSendResult = { ok: true; operation: MessageSendOperation } | MessageSendFailure;
