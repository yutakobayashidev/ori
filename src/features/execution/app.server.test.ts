// @vitest-environment node
import { createHash } from "node:crypto";
import { beeperConversations, beeperMessageSends } from "../storage/schema";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import {
  getActivityContext,
  publishActivities,
  updateActivityUser,
} from "../activities/repository.server";
import { loadExecutionApp, callExecutionAppTool } from "./app.server";
import { executionRun } from "./model";

const mocks = vi.hoisted(() => ({
  run: vi.fn<(...args: unknown[]) => unknown>(),
  event: vi.fn<(...args: unknown[]) => void>(),
  messaging: vi.fn<(...args: unknown[]) => Promise<{ ok: true }>>(),
}));
vi.mock("../beeper/messaging-tools.server", () => ({ executeMessagingTool: mocks.messaging }));
vi.mock("./service.server", () => ({
  getExecutionRun: mocks.run,
}));
vi.mock("../mcp-events/events.server", () => ({ enqueueActivityEvent: mocks.event }));
vi.mock("../storage/database.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../storage/database.server")>()),
  getDatabase: () => database,
}));
let database: AppDatabase;
const runId = "999c7e78-e984-4ef9-9250-773076e56cd4";
const appInput = { id: runId, toolCallId: "call-one" };
beforeEach(() => {
  database = openDatabase(":memory:");
  publishActivities(
    {
      requestId: "seed",
      expectedRevision: 0,
      activities: [
        { id: "task", kind: "task", title: "Read report", nextAction: "Read", sources: [] },
        {
          id: "reply",
          kind: "reply",
          title: "Reply to Aoki",
          nextAction: "Draft reply",
          sources: [
            {
              id: "source",
              kind: "message",
              provider: "beeper",
              targetId: "um790",
              accountId: "work",
              chatId: "chat",
              messageId: "message",
              observedAt: "2026-10-09T00:00:00Z",
              excerpt: "Can you review this?",
            },
          ],
          reply: {
            recipientName: "Aoki",
            sourceId: "source",
            context: "Review request",
            draft: "Initial draft",
          },
        },
      ],
    },
    database,
  );
  mocks.run.mockReset().mockReturnValue(
    executionRun.parse({
      id: runId,
      activityId: "reply",
      status: "review",
      createdAt: 1,
      updatedAt: 2,
      messages: [],
      toolCalls: [
        {
          id: "call-one",
          name: "get_activity_context",
          arguments: {},
          status: "completed",
          result: {
            structuredContent: getActivityContext({ activityIds: ["reply"] }, database),
            _meta: { ui: { resourceUri: "ui://personal-workspace/app-v1.html" } },
          },
        },
      ],
    }),
  );
  mocks.event.mockClear();
  mocks.messaging.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => database.$client.close());

it.each(["get_activity_context", "update_activity_progress"])(
  "reopens a persisted %s app after execution ends with current draft state",
  async (name) => {
    const run = executionRun.parse(await mocks.run());
    mocks.run.mockReturnValue({
      ...run,
      toolCalls: run.toolCalls.map((call) => ({ ...call, name })),
    });
    updateActivityUser(
      { requestId: "owner", expectedRevision: 1, id: "reply", overrides: { draft: "Latest edit" } },
      database,
    );
    const app = await loadExecutionApp(appInput);
    expect(app.resourceUri).toBe("ui://personal-workspace/app-v1.html");
    expect(app.html).toContain("html");
    expect(app.result.structuredContent.activities[0]?.effective).toMatchObject({
      reply: { draft: "Latest edit" },
    });
  },
);
it("lets the embedded card edit its task as the user and rejects another activity", async () => {
  const result = await callExecutionAppTool({
    ...appInput,
    name: "update_activity",
    arguments: {
      id: "reply",
      requestId: "app-edit",
      expectedRevision: 1,
      state: "waiting",
      overrides: { draft: "Edited in card" },
    },
  });
  expect(result.isError).toBe(false);
  expect(mocks.event.mock.calls.map(([name, payload]) => ({ name, payload }))).toEqual([
    {
      name: "activity.status_changed",
      payload: expect.objectContaining({ origin: "user", state: "waiting" }),
    },
  ]);
  expect(
    await callExecutionAppTool({
      ...appInput,
      name: "update_activity",
      arguments: { id: "task", requestId: "escape", expectedRevision: 2, state: "completed" },
    }),
  ).toMatchObject({ isError: true });
  expect(
    await callExecutionAppTool({
      ...appInput,
      name: "get_activity_context",
      arguments: { activityIds: ["task"] },
    }),
  ).toMatchObject({ isError: true });
});
it("rejects fabricated or untrusted app instances", async () => {
  await expect(loadExecutionApp({ ...appInput, toolCallId: "missing" })).rejects.toThrow(
    "unavailable",
  );
  mocks.run.mockReturnValue({
    activityId: "reply",
    toolCalls: [
      {
        id: "call-one",
        name: "get_activity_context",
        status: "completed",
        result: { _meta: { ui: { resourceUri: "https://untrusted.invalid" } } },
      },
    ],
  });
  await expect(loadExecutionApp(appInput)).rejects.toThrow("unavailable");
});

it("restores a saved card by its bundled resource contract regardless of the tool name", async () => {
  const run = executionRun.parse(await mocks.run());
  mocks.run.mockReturnValue({
    ...run,
    toolCalls: run.toolCalls.map((call) => ({ ...call, name: "saved_tool_name" })),
  });
  const app = await loadExecutionApp(appInput);
  expect(app.result.structuredContent.activities.map((activity) => activity.id)).toEqual(["reply"]);
  expect(app.arguments).toEqual({ activityIds: ["reply"] });
});

it.each(["read_activity_conversation", "send_activity_reply"] as const)(
  "scopes embedded %s to the card's activity before calling Beeper",
  async (name) => {
    expect(
      await callExecutionAppTool({ ...appInput, name, arguments: { activityId: "task" } }),
    ).toMatchObject({ isError: true });
    expect(mocks.messaging).not.toHaveBeenCalled();
    expect(
      await callExecutionAppTool({ ...appInput, name, arguments: { activityId: "reply" } }),
    ).toMatchObject({ isError: false });
    expect(mocks.messaging).toHaveBeenCalledExactlyOnceWith(name, { activityId: "reply" });
  },
);

it("looks up the persisted send's activity rather than trusting the supplied activity ID", async () => {
  for (const activityId of ["reply", "task"])
    database
      .insert(beeperMessageSends)
      .values({
        id: `send-${activityId}`,
        requestId: `request-${activityId}`,
        payloadHash: "hash",
        activityId,
        targetId: "um790",
        accountId: "work",
        chatId: "chat",
        body: "Reviewed text",
        draftHash: "hash",
        expectedRevision: 1,
        state: "accepted",
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
  expect(
    await callExecutionAppTool({
      ...appInput,
      name: "get_message_send",
      arguments: { operationId: "send-task", activityId: "reply" },
    }),
  ).toMatchObject({ isError: true });
  expect(
    await callExecutionAppTool({
      ...appInput,
      name: "get_message_send",
      arguments: { operationId: "send-task" },
    }),
  ).toMatchObject({ isError: true });
  expect(
    await callExecutionAppTool({
      ...appInput,
      name: "get_message_send",
      arguments: { operationId: "missing" },
    }),
  ).toMatchObject({ isError: true });
  expect(mocks.messaging).not.toHaveBeenCalled();
  expect(
    await callExecutionAppTool({
      ...appInput,
      name: "get_message_send",
      arguments: { operationId: "send-reply" },
    }),
  ).toMatchObject({ isError: false });
  expect(mocks.messaging).toHaveBeenCalledExactlyOnceWith("get_message_send", {
    operationId: "send-reply",
  });
});

it("allows only avatars observed in the delegated conversation", async () => {
  const identity = { targetId: "um790", accountId: "work", chatId: "chat" };
  const avatarId = "a".repeat(64);
  database
    .insert(beeperConversations)
    .values({
      id: createHash("sha256")
        .update(JSON.stringify([identity.targetId, identity.accountId, identity.chatId]))
        .digest("hex"),
      ...identity,
      data: {
        ...identity,
        title: "Aoki",
        network: "Discord",
        type: "single",
        participants: [{ id: "aoki", avatarId }],
        isMerged: false,
      },
      observedAt: 1,
    })
    .run();
  expect(
    await callExecutionAppTool({
      ...appInput,
      name: "get_beeper_asset",
      arguments: { assetId: "b".repeat(64) },
    }),
  ).toMatchObject({ isError: true });
  expect(mocks.messaging).not.toHaveBeenCalled();
  expect(
    await callExecutionAppTool({
      ...appInput,
      name: "get_beeper_asset",
      arguments: { assetId: avatarId },
    }),
  ).toMatchObject({ isError: false });
  expect(mocks.messaging).toHaveBeenCalledExactlyOnceWith("get_beeper_asset", {
    assetId: avatarId,
  });
});
