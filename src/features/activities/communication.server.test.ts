// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import {
  getCommunicationLogs,
  logEventDelivery,
  logMcpExchange,
  redactCommunication,
  saveCommunication,
} from "./communication.server";
import type { CommunicationLog } from "./communication-model";

let database: AppDatabase;
const mocks = vi.hoisted(() => ({ database: vi.fn<() => AppDatabase>() }));
vi.mock("../storage/database.server", async (original) => ({
  ...(await original<typeof import("../storage/database.server")>()),
  getDatabase: mocks.database,
}));
beforeEach(() => {
  database = openDatabase(":memory:");
  mocks.database.mockReturnValue(database);
});
afterEach(() => {
  database.$client.close();
  vi.restoreAllMocks();
});
const entry: Omit<CommunicationLog, "id"> = {
  kind: "mcp-write",
  direction: "incoming",
  name: "publish_activities",
  occurredAt: 1,
  durationMs: 2,
  outcome: "success",
  status: null,
  requestId: "request",
  eventId: null,
  subscriptionId: null,
  attempt: null,
  activityIds: ["one"],
  request: {},
  response: {},
};

it("redacts credential keys recursively while preserving task content", () => {
  expect(
    redactCommunication(
      {
        title: "Reply to customer",
        body: "The draft is ready",
        nested: [{ authorization: "Bearer abc", cookie: "session=s", apiKey: "private" }],
        callback: "https://user:password@callback.invalid/events?key=secret#private",
        text: "Bearer abc whsec_aGVsbG8= known-private",
      },
      ["known-private"],
    ),
  ).toEqual({
    title: "Reply to customer",
    body: "The draft is ready",
    nested: [{ authorization: "[redacted]", cookie: "[redacted]", apiKey: "[redacted]" }],
    callback: "https://callback.invalid/events",
    text: "Bearer [redacted] [redacted] [redacted]",
  });
});

it("removes secrets echoed in JSON response strings and across request and response", () => {
  saveCommunication(
    {
      ...entry,
      request: { secret: "request-private" },
      response: JSON.stringify({
        token: "response-private",
        echo: "response-private request-private",
      }),
    },
    database,
  );
  expect(getCommunicationLogs({}, database).entries[0]).toMatchObject({
    request: { secret: "[redacted]" },
    response: { token: "[redacted]", echo: "[redacted] [redacted]" },
  });
});

it("paginates newest-first and filters by exact activity ID", () => {
  saveCommunication(entry, database);
  saveCommunication({ ...entry, activityIds: ["one-more"], requestId: "other" }, database);
  saveCommunication({ ...entry, requestId: "latest" }, database);
  const first = getCommunicationLogs({ activityId: "one", limit: 1 }, database);
  expect(first.entries.map((item) => item.requestId)).toEqual(["latest"]);
  const second = getCommunicationLogs(
    { activityId: "one", limit: 1, beforeId: first.nextBeforeId },
    database,
  );
  expect(second.entries.map((item) => item.requestId)).toEqual(["request"]);
  expect(second.nextBeforeId).toBeNull();
});

it("bounds large response bodies after removing secrets", () => {
  saveCommunication(
    { ...entry, response: { secret: "private", text: "x".repeat(70_000) } },
    database,
  );
  const response = getCommunicationLogs({}, database).entries[0]?.response;
  expect(response).toMatchObject({ truncated: true });
  expect(JSON.stringify(response)).not.toContain("private");
  expect(JSON.stringify(response).length).toBeLessThan(66_000);
});

it("records each delivery attempt, including transport failure and later success", async () => {
  const input = {
    name: "activity.created",
    eventId: "event",
    subscriptionId: "sub",
    attempt: 1,
    body: JSON.stringify({ data: { activityId: "one", requestId: "create" } }),
    secrets: ["private"],
  };
  const failure = new Error("private callback error");
  await expect(
    logEventDelivery(
      input,
      async () => {
        throw failure;
      },
      database,
    ),
  ).rejects.toBe(failure);
  await expect(
    logEventDelivery(
      { ...input, attempt: 2 },
      async () => ({ status: 200, body: "private accepted" }),
      database,
    ),
  ).resolves.toEqual({ status: 200, body: "private accepted" });
  expect(getCommunicationLogs({ activityId: "one" }, database).entries).toMatchObject([
    {
      attempt: 2,
      eventId: "event",
      outcome: "success",
      status: 200,
      response: "[redacted] accepted",
    },
    {
      attempt: 1,
      eventId: "event",
      outcome: "error",
      status: null,
      response: { error: "transport_error" },
    },
  ]);
});

it("does not change a successful delivery when logging fails", async () => {
  database.$client.exec("DROP TABLE communication_logs");
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
  await expect(
    logEventDelivery(
      {
        name: "event",
        eventId: "event",
        subscriptionId: "sub",
        attempt: 1,
        body: "{}",
        secrets: [],
      },
      async () => ({ status: 204, body: "" }),
      database,
    ),
  ).resolves.toEqual({ status: 204, body: "" });
});

it("removes callback URLs including secret path segments and echoed destinations", () => {
  const url = "https://callback.invalid/private-path?token=private-query";
  saveCommunication(
    { ...entry, request: { delivery: { url } }, response: `Received at ${url}` },
    database,
  );
  expect(getCommunicationLogs({}, database).entries[0]).toMatchObject({
    request: { delivery: { url: "[redacted]" } },
    response: "Received at [redacted]",
  });
});

it("does not turn malformed log payloads into delivery failures", async () => {
  await expect(
    logEventDelivery(
      {
        name: "event",
        eventId: "event",
        subscriptionId: "sub",
        attempt: 1,
        body: "not-json",
        secrets: [],
      },
      async () => ({ status: 204, body: "" }),
      database,
    ),
  ).resolves.toEqual({ status: 204, body: "" });
  expect(getCommunicationLogs({}, database).entries[0]).toMatchObject({
    request: "not-json",
    outcome: "success",
  });
});

it("links send operations and event subscriptions to their activities", async () => {
  await logMcpExchange("get_reply_result", { operationId: "send" }, () => ({
    ok: true,
    operation: { activityId: "reply" },
  }));
  await logMcpExchange(
    "events/subscribe",
    { arguments: { activityIds: ["reply"] } },
    () => ({ id: "sub" }),
    "mcp-event",
  );
  expect(getCommunicationLogs({ activityId: "reply" }, database).entries).toMatchObject([
    { name: "events/subscribe", subscriptionId: "sub" },
    { name: "get_reply_result" },
  ]);
});

it("links failed operations by input activityId and preserves the original error", async () => {
  const error = new Error("internal secret details");
  await expect(
    logMcpExchange("send_activity_reply", { activityId: "reply" }, () => {
      throw error;
    }),
  ).rejects.toBe(error);
  expect(getCommunicationLogs({ activityId: "reply" }, database).entries).toMatchObject([
    {
      name: "send_activity_reply",
      outcome: "error",
      response: { error: { code: "execution-error" } },
    },
  ]);
  expect(JSON.stringify(getCommunicationLogs({}, database))).not.toContain(
    "internal secret details",
  );
});
