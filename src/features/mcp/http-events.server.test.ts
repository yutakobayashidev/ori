// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import { mcpEventOutbox, mcpEventSubscriptions } from "../storage/schema";
import { createUserActivity, updateActivityUser } from "../activities/repository.server";
import { deliverMcpEvents } from "../mcp-events/events.server";
import { handleMcpRequest, registerResearchTools } from "./http.server";

const mocks = vi.hoisted(() => ({
  database: vi.fn<() => AppDatabase>(),
  sender: vi.fn<typeof import("../mcp-events/webhook.server").sendWebhook>(),
}));
vi.mock("../storage/database.server", async (original) => ({
  ...(await original<typeof import("../storage/database.server")>()),
  getDatabase: mocks.database,
}));
vi.mock("../connections/credentials.server", () => ({
  encryptCredential: (value: string) => `encrypted:${value}`,
  decryptCredential: (value: string) => value.slice("encrypted:".length),
}));
vi.mock("../mcp-events/webhook.server", async (original) => ({
  ...(await original<typeof import("../mcp-events/webhook.server")>()),
  sendWebhook: mocks.sender,
}));
let database: AppDatabase;
beforeEach(() => {
  vi.clearAllMocks();
  database = openDatabase(":memory:");
  mocks.database.mockReturnValue(database);
  mocks.sender.mockImplementation(async (_url: string, body: string) => ({
    status: 200,
    body: JSON.stringify({ challenge: JSON.parse(body).challenge }),
  }));
});
afterEach(() => database.$client.close());

async function rpc(method: string, params: Record<string, unknown> = {}, query = "") {
  const response = await handleMcpRequest(
    new Request(`http://workspace.invalid/mcp${query}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Mcp-Method": method,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: {
          ...params,
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      }),
    }),
  );
  return response.json();
}
const subscription = {
  name: "beeper.message.received",
  arguments: { chatIds: ["chat-example"] },
  delivery: {
    mode: "webhook",
    url: "https://callback.invalid/events",
    secret: `whsec_${Buffer.alloc(32, 4).toString("base64")}`,
  },
};

it("advertises events and verifies, persists, refreshes and removes a modern MCP subscription", async () => {
  expect(await rpc("server/discover")).toMatchObject({
    result: { capabilities: { events: {}, tools: {} } },
  });
  expect(await rpc("events/list")).toMatchObject({
    result: {
      events: [
        { name: "beeper.message.received", delivery: ["webhook"] },
        { name: "beeper.message.sent", delivery: ["webhook"] },
        { name: "activity.created", delivery: ["webhook"] },
        { name: "activity.status_changed", delivery: ["webhook"] },
        { name: "activity.time_changed", delivery: ["webhook"] },
      ],
    },
  });
  const created = await rpc("events/subscribe", subscription);
  expect(created.error).toBeUndefined();
  expect(created.result.id).toMatch(/^sub_/);
  expect(database.select().from(mcpEventSubscriptions).all()).toHaveLength(1);
  const refreshed = await rpc("events/subscribe", subscription);
  expect(refreshed.result.id).toBe(created.result.id);
  expect(mocks.sender).toHaveBeenCalledTimes(1);
  expect(await rpc("events/unsubscribe", subscription)).toMatchObject({ result: {} });
  expect(database.select().from(mcpEventSubscriptions).all()).toHaveLength(0);
});

it("delivers task creation and status changes to subscriptions created through HTTP", async () => {
  const created = await rpc("events/subscribe", {
    ...subscription,
    name: "activity.created",
    arguments: {},
  });
  const changed = await rpc("events/subscribe", {
    ...subscription,
    name: "activity.status_changed",
    arguments: { activityIds: ["task-example"] },
  });
  expect(created.error).toBeUndefined();
  expect(changed.error).toBeUndefined();
  createUserActivity(
    {
      requestId: "create-example",
      expectedRevision: 0,
      id: "task-example",
      title: "Review the proposal",
      nextAction: "Read the first draft",
      section: "focus",
    },
    database,
  );
  updateActivityUser(
    {
      requestId: "complete-example",
      expectedRevision: 1,
      id: "task-example",
      state: "completed",
    },
    database,
  );
  mocks.sender.mockClear();
  mocks.sender.mockResolvedValue({ status: 202, body: "" });
  expect(await deliverMcpEvents(database)).toEqual({ attempted: 2, delivered: 2 });
  const payloads = mocks.sender.mock.calls.map(([, body]) => JSON.parse(body));
  expect(payloads).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "activity.created",
        data: expect.objectContaining({
          activityId: "task-example",
          state: "available",
          origin: "user",
          revision: 1,
        }),
      }),
      expect.objectContaining({
        name: "activity.status_changed",
        data: expect.objectContaining({
          activityId: "task-example",
          previousState: "available",
          state: "completed",
          revision: 2,
        }),
      }),
    ]),
  );
  expect(
    database
      .select()
      .from(mcpEventOutbox)
      .all()
      .every((row) => row.deliveredAt !== null),
  ).toBe(true);
  expect(
    await rpc("events/unsubscribe", {
      ...subscription,
      name: "activity.status_changed",
      arguments: { activityIds: ["task-example"] },
    }),
  ).toMatchObject({ result: {} });
  expect(database.select().from(mcpEventSubscriptions).all()).toHaveLength(1);
});

it("rejects filters belonging to a different event over HTTP", async () => {
  expect(
    await rpc("events/subscribe", { ...subscription, name: "activity.created" }),
  ).toMatchObject({ error: { code: -32602 } });
  expect(database.select().from(mcpEventSubscriptions).all()).toHaveLength(0);
  expect(mocks.sender).not.toHaveBeenCalled();
});

it("rejects callback verification failure without saving the subscription", async () => {
  mocks.sender.mockResolvedValue({ status: 200, body: '{"challenge":"wrong"}' });
  expect(await rpc("events/subscribe", subscription)).toMatchObject({
    error: {
      code: -32015,
      data: { reason: "challenge_failed" },
    },
  });
  expect(database.select().from(mcpEventSubscriptions).all()).toHaveLength(0);
});

it("does not offer workspace event subscriptions to internal research callers", async () => {
  const registration = registerResearchTools({
    definitions: [],
    execute: async () => ({ ok: true }),
  });
  try {
    const discovery = await rpc("server/discover", {}, `?research=${registration.id}`);
    expect(discovery.result.capabilities.events).toBeUndefined();
    expect(await rpc("events/list", {}, `?research=${registration.id}`)).toMatchObject({
      error: { code: -32601 },
    });
  } finally {
    registration.dispose();
  }
});

it("subscribes to outgoing observations independently through MCP HTTP", async () => {
  const incoming = await rpc("events/subscribe", subscription);
  const outgoing = { ...subscription, name: "beeper.message.sent" };
  const sent = await rpc("events/subscribe", outgoing);
  expect(sent.error).toBeUndefined();
  expect(sent.result.id).not.toBe(incoming.result.id);
  expect(database.select().from(mcpEventSubscriptions).all()).toHaveLength(2);
  expect(await rpc("events/unsubscribe", outgoing)).toMatchObject({ result: {} });
  expect(database.select().from(mcpEventSubscriptions).get()?.name).toBe("beeper.message.received");
});
