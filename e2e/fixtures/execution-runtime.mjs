import { createServer } from "node:http";

// A persisted completed run isolates browser/bridge behavior from model output.
// The app still uses its real authenticated endpoints and Activity database.
const run = {
  id: "30000000-0000-4000-8000-000000000001",
  activityId: "review-times",
  status: "review",
  createdAt: 1,
  updatedAt: 2,
  messages: [
    { id: "user", role: "user", text: "Prepare a reply draft." },
    { id: "assistant", role: "assistant", text: "The draft is ready to edit below." },
  ],
  toolCalls: [
    {
      id: "draft-card",
      name: "update_activity_progress",
      arguments: {
        id: "review-times",
        requestId: "draft-write",
        expectedRevision: 1,
        draft: "Could we meet on Tuesday or Thursday?",
        reason: "Prepared a reply from the conversation.",
        evidence: [
          {
            kind: "beeper_message",
            targetId: "um790",
            accountId: "work",
            chatId: "chat",
            messageId: "message",
          },
        ],
      },
      afterMessageId: "assistant",
      status: "completed",
      result: {
        content: [],
        structuredContent: { ok: true },
        _meta: { ui: { resourceUri: "ui://personal-workspace/app-v1.html" } },
      },
    },
  ],
  artifacts: [],
};

createServer((req, res) => {
  if (req.headers.authorization !== "Bearer isolated-execution-app-test-token") {
    res.writeHead(401).end();
    return;
  }
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/runs") res.end(JSON.stringify([run]));
  else if (req.url === `/runs/${run.id}`) res.end(JSON.stringify(run));
  else res.writeHead(404).end("{}");
}).listen(4339, "127.0.0.1");
