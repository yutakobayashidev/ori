// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import { beeperMessageSends } from "../storage/schema";
import { createExecutionTools } from "./tools.server";
const mocks = vi.hoisted(() => ({
  valid: vi.fn<() => Promise<boolean>>(),
  run: vi.fn<() => Promise<{ activityId: string }>>(),
  execute: vi.fn<(name: string, input: unknown) => Promise<{ ok: true }>>(),
}));
vi.mock("./service.server", () => ({
  executionScopeIsValid: mocks.valid,
  getExecutionRun: mocks.run,
}));
vi.mock("../mcp/workspace-tools.server", () => ({
  createWorkspaceTools: () => ({
    definitions: [
      "read_activity_conversation",
      "send_activity_reply",
      "get_message_send",
      "get_beeper_asset",
    ].map((name) => ({ name })),
    execute: mocks.execute,
  }),
}));
vi.mock("../storage/database.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../storage/database.server")>()),
  getDatabase: () => database,
}));
let database: AppDatabase;
beforeEach(() => {
  database = openDatabase(":memory:");
  mocks.valid.mockReset().mockResolvedValue(true);
  mocks.run.mockReset().mockResolvedValue({ activityId: "reply" });
  mocks.execute.mockReset().mockResolvedValue({ ok: true });
  for (const activityId of ["reply", "other"])
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
});
afterEach(() => database.$client.close());

it.each(["read_activity_conversation", "send_activity_reply"])(
  "rejects cross-activity %s before reaching the workspace service",
  async (name) => {
    const tools = await createExecutionTools("run", "proof");
    expect(await tools?.execute(name, { activityId: "other" })).toMatchObject({
      ok: false,
      error: { code: "activity-out-of-scope" },
    });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(await tools?.execute(name, { activityId: "reply" })).toEqual({ ok: true });
    expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(name, { activityId: "reply" });
  },
);

it("authorizes send status from its stored activity and rejects missing or forged operation targets", async () => {
  const tools = await createExecutionTools("run", "proof");
  expect(await tools?.execute("get_message_send", { operationId: "send-other" })).toMatchObject({
    ok: false,
    error: { code: "activity-out-of-scope" },
  });
  expect(await tools?.execute("get_message_send", { operationId: "missing" })).toMatchObject({
    ok: false,
    error: { code: "activity-out-of-scope" },
  });
  expect(
    await tools?.execute("get_message_send", { operationId: "send-other", activityId: "reply" }),
  ).toMatchObject({ ok: false });
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(await tools?.execute("get_message_send", { operationId: "send-reply" })).toEqual({
    ok: true,
  });
});

it("does not expose image reads to the model and revokes messaging calls when the execution ends", async () => {
  const tools = await createExecutionTools("run", "proof");
  expect(tools?.definitions.map((tool) => tool.name)).not.toContain("get_beeper_asset");
  expect(await tools?.execute("get_beeper_asset", { assetId: "a".repeat(64) })).toMatchObject({
    ok: false,
  });
  mocks.valid.mockResolvedValue(false);
  expect(await tools?.execute("send_activity_reply", { activityId: "reply" })).toMatchObject({
    ok: false,
    error: { code: "execution-unavailable" },
  });
  expect(mocks.execute).not.toHaveBeenCalled();
});
