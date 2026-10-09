#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const [, , ...args] = process.argv;
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=";
const chat = {
  id: "same-chat",
  accountID: "e2e-account",
  title: "Haruka Aoki",
  network: "Discord",
  type: "single",
  isReadOnly: false,
  imgURL: `data:image/png;base64,${png}`,
  participants: {
    items: [
      { id: "haruka", fullName: "Haruka Aoki", imgURL: `data:image/png;base64,${png}` },
      { id: "owner", fullName: "Yuta", isSelf: true },
    ],
    hasMore: false,
  },
  capabilities: { reply: 2, maxTextLength: 4000 },
};
const messages = [
  {
    id: "message-0",
    chatID: chat.id,
    accountID: chat.accountID,
    senderID: "haruka",
    senderName: "Haruka Aoki",
    isSender: false,
    text: "Please review the materials and suggest two times.",
    timestamp: "2026-10-07T01:00:00Z",
    sortKey: "1",
  },
  {
    id: "clarification",
    chatID: chat.id,
    accountID: chat.accountID,
    senderID: "haruka",
    senderName: "Haruka Aoki",
    isSender: false,
    text: "Thursday afternoon would be best.",
    timestamp: "2026-10-07T02:00:00Z",
    sortKey: "2",
  },
];
function respond(data) {
  process.stdout.write(JSON.stringify({ success: true, data }));
}
if (args[0] === "media") process.stdout.write(Buffer.from(png, "base64"));
else if (args[0] === "api" && args[1] === "get") {
  const path = args[2].split("?")[0];
  if (path === "/v1/chats/same-chat") respond(chat);
  else if (path === "/v1/chats/same-chat/messages")
    respond({ items: messages, hasMore: false, oldestCursor: null, newestCursor: null });
  else if (path.startsWith("/v1/chats/same-chat/messages/")) {
    const id = decodeURIComponent(path.split("/").at(-1));
    const message = messages.find((item) => item.id === id);
    if (message) respond(message);
    else process.exit(1);
  } else process.exit(1);
} else if (args[0] === "api" && args[1] === "post") {
  if (!process.env.TWITTER_LITE_BEEPER_TEST_SEND_LOG) process.exit(1);
  const body = JSON.parse(args[args.indexOf("--body") + 1]);
  appendFileSync(process.env.TWITTER_LITE_BEEPER_TEST_SEND_LOG, JSON.stringify(body) + "\n");
  respond({ chatID: chat.id, pendingMessageID: "test-pending" });
} else process.exit(1);
