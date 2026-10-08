// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import {
  getActivityContext,
  publishActivities,
  updateActivityUser,
} from "../activities/repository.server";
import { subscribeActivities } from "../activities/events.server";
import { activityAppResult, executeActivityTool } from "./activity-tools.server";
import { loadExecutionApp, callExecutionAppTool } from "./app.server";
import { handleExecutionTool } from "./dynamic-tool.server";
import { executionRun } from "./model";

const mocks = vi.hoisted(() => ({
  run: vi.fn<(...args: unknown[]) => unknown>(),
  scope: vi.fn<(...args: unknown[]) => boolean>(),
  event: vi.fn<(...args: unknown[]) => void>(),
}));
vi.mock("./service.server", () => ({
  getExecutionRun: mocks.run,
  executionScopeIsValid: mocks.scope,
}));
vi.mock("../mcp-events/events.server", () => ({ enqueueActivityEvent: mocks.event }));
vi.mock("../storage/database.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../storage/database.server")>()),
  getDatabase: () => database,
}));
let database: AppDatabase;
const runId = "999c7e78-e984-4ef9-9250-773076e56cd4";
const scope = { id: runId, activityId: "reply" };
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
          name: "get_current_activity",
          arguments: {},
          status: "completed",
          result: activityAppResult("reply", database),
        },
      ],
    }),
  );
  mocks.scope.mockReset().mockReturnValue(true);
  mocks.event.mockClear();
});
afterEach(() => database.$client.close());

it("changes only its delegated task and emits agent origin plus browser updates", () => {
  const notify = vi.fn<() => void>();
  const unsubscribe = subscribeActivities(notify);
  const result = executeActivityTool(
    scope,
    {
      toolCallId: "status",
      name: "set_activity_status",
      arguments: { expectedRevision: 1, state: "inProgress" },
    },
    database,
  );
  unsubscribe();
  expect(result.isError).toBe(false);
  const context = getActivityContext({}, database);
  expect(context.activities.find((a) => a.id === "reply")?.userState).toBe("inProgress");
  expect(context.activities.find((a) => a.id === "task")?.userState).toBe("available");
  expect(notify).toHaveBeenCalledTimes(1);
  expect(mocks.event.mock.calls.map(([name, payload]) => ({ name, payload }))).toEqual([
    {
      name: "activity.status_changed",
      payload: expect.objectContaining({ origin: "agent", state: "inProgress" }),
    },
  ]);
});
it("saves a reply draft durably and an exact callback retry does not mutate twice", () => {
  const call = {
    toolCallId: "draft",
    name: "save_reply_draft",
    arguments: { expectedRevision: 1, draft: "確認して明日ご連絡します。" },
  };
  expect(executeActivityTool(scope, call, database).isError).toBe(false);
  expect(executeActivityTool(scope, call, database).isError).toBe(false);
  const context = getActivityContext({}, database);
  expect(context.revision).toBe(2);
  expect(context.activities.find((a) => a.id === "reply")?.effective).toMatchObject({
    reply: { draft: "確認して明日ご連絡します。" },
  });
  expect(
    executeActivityTool(
      scope,
      { ...call, arguments: { ...call.arguments, draft: "Different" } },
      database,
    ),
  ).toMatchObject({
    isError: true,
    structuredContent: { error: { code: "idempotency-conflict" } },
  });
});
it("rejects a stale draft instead of overwriting a concurrent owner edit", () => {
  updateActivityUser(
    {
      requestId: "owner",
      expectedRevision: 1,
      id: "reply",
      overrides: { draft: "Owner's wording" },
    },
    database,
  );
  expect(
    executeActivityTool(
      scope,
      {
        toolCallId: "stale",
        name: "save_reply_draft",
        arguments: { expectedRevision: 1, draft: "Stale AI draft" },
      },
      database,
    ),
  ).toMatchObject({ isError: true, structuredContent: { error: { code: "revision-conflict" } } });
  expect(
    getActivityContext({ activityIds: ["reply"] }, database).activities[0]?.effective,
  ).toMatchObject({ reply: { draft: "Owner's wording" } });
});
it("does not accept target overrides, send tools, reply completion or drafts on tasks", () => {
  expect(
    executeActivityTool(
      scope,
      {
        toolCallId: "escape",
        name: "set_activity_status",
        arguments: { id: "task", expectedRevision: 1, state: "completed" },
      },
      database,
    ).isError,
  ).toBe(true);
  expect(
    executeActivityTool(scope, { toolCallId: "send", name: "send_reply", arguments: {} }, database)
      .isError,
  ).toBe(true);
  expect(
    executeActivityTool(
      scope,
      {
        toolCallId: "complete",
        name: "set_activity_status",
        arguments: { expectedRevision: 1, state: "completed" },
      },
      database,
    ).isError,
  ).toBe(true);
  expect(
    executeActivityTool(
      { ...scope, activityId: "task" },
      {
        toolCallId: "draft",
        name: "save_reply_draft",
        arguments: { expectedRevision: 1, draft: "Oops" },
      },
      database,
    ).isError,
  ).toBe(true);
  expect(getActivityContext({}, database).revision).toBe(1);
});
it("allows requested task completion without treating AI turn completion as task completion", () => {
  const result = executeActivityTool(
    { ...scope, activityId: "task" },
    {
      toolCallId: "done",
      name: "set_activity_status",
      arguments: { expectedRevision: 1, state: "completed" },
    },
    database,
  );
  expect(result.isError).toBe(false);
  expect(getActivityContext({ activityIds: ["task"] }, database).activities[0]?.userState).toBe(
    "completed",
  );
});
it("reopens a persisted app after execution ends with current draft state", async () => {
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
});
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
        status: "completed",
        result: { _meta: { ui: { resourceUri: "https://untrusted.invalid" } } },
      },
    ],
  });
  await expect(loadExecutionApp(appInput)).rejects.toThrow("unavailable");
});
it("revokes callbacks without valid scope or when a run stops during validation", async () => {
  const request = () =>
    new Request(`http://workspace.invalid/api/execution/tool?execution=${runId}&proof=bad`, {
      method: "POST",
      body: JSON.stringify({ toolCallId: "x", name: "get_current_activity", arguments: {} }),
    });
  mocks.scope.mockReturnValue(false);
  expect((await handleExecutionTool(request())).status).toBe(403);
  mocks.scope.mockReturnValue(true);
  expect((await handleExecutionTool(request())).status).toBe(403);
  expect(getActivityContext({}, database).revision).toBe(1);
});
