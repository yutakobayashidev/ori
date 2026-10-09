import { createServerFn } from "@tanstack/react-start";
import { getBeeperAssetInput, readActivityConversationInput } from "./conversation-model";
import { getMessageSendInput, sendActivityReplyInput } from "./sends-model";
import type { ActivityMessagingTransport } from "../activities/messaging-client";

export const loadReplyAvatar = createServerFn({ method: "GET" })
  .validator(readActivityConversationInput.pick({ activityId: true }))
  .handler(async ({ data }) => {
    const { readActivityAvatar } = await import("./avatar.server");
    return readActivityAvatar(data);
  });

export const loadReplyConversation = createServerFn({ method: "GET" })
  .validator(readActivityConversationInput)
  .handler(async ({ data }) => {
    const { executeMessagingTool } = await import("./messaging-tools.server");
    return executeMessagingTool("read_activity_conversation", data) as ReturnType<
      ActivityMessagingTransport["readConversation"]
    >;
  });
export const sendReply = createServerFn({ method: "POST" })
  .validator(sendActivityReplyInput)
  .handler(async ({ data }) => {
    const { executeMessagingTool } = await import("./messaging-tools.server");
    return executeMessagingTool("send_activity_reply", data) as ReturnType<
      ActivityMessagingTransport["sendReply"]
    >;
  });
export const loadMessageSend = createServerFn({ method: "GET" })
  .validator(getMessageSendInput)
  .handler(async ({ data }) => {
    const { executeMessagingTool } = await import("./messaging-tools.server");
    return executeMessagingTool("get_message_send", data) as ReturnType<
      ActivityMessagingTransport["getSend"]
    >;
  });
export const loadBeeperAsset = createServerFn({ method: "GET" })
  .validator(getBeeperAssetInput)
  .handler(async ({ data }) => {
    const { executeMessagingTool } = await import("./messaging-tools.server");
    return executeMessagingTool("get_beeper_asset", data) as ReturnType<
      ActivityMessagingTransport["getAsset"]
    >;
  });
