// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import { mcpEventSubscriptions } from "../storage/schema";
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
    result: { events: [{ name: "beeper.message.received", delivery: ["webhook"] }] },
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
