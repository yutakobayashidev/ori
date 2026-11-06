// @vitest-environment node
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import { communicationLogs } from "../storage/schema";
import { getCommunicationLogs } from "./communication.server";
import type { CommunicationLog } from "./communication-model";

let database: AppDatabase;
beforeEach(() => {
  database = openDatabase(":memory:");
});
afterEach(() => {
  database.$client.close();
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

it("preserves paginated access to communication history collected before telemetry", () => {
  database
    .insert(communicationLogs)
    .values([
      entry,
      { ...entry, activityIds: ["one-more"], requestId: "other" },
      { ...entry, requestId: "latest" },
    ])
    .run();
  const first = getCommunicationLogs({ activityId: "one", limit: 1 }, database);
  expect(first.entries.map((item) => item.requestId)).toEqual(["latest"]);
  const second = getCommunicationLogs(
    { activityId: "one", limit: 1, beforeId: first.nextBeforeId },
    database,
  );
  expect(second.entries.map((item) => item.requestId)).toEqual(["request"]);
  expect(second.nextBeforeId).toBeNull();
});
