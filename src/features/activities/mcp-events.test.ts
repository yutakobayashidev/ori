// @vitest-environment node
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { subscribeMcpEvent } from "../mcp-events/events.server";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import { mcpEventOutbox } from "../storage/schema";
import {
  createUserActivity,
  updateActivityProgress,
  getActivityContext,
  publishActivities,
  updateActivityUser,
} from "./repository.server";

let database: AppDatabase;
let directory: string;
const task = {
  id: "task",
  kind: "task",
  title: "Review request",
  nextAction: "Read the proposal",
  sources: [],
};
const userInput = {
  id: "task",
  requestId: "create",
  expectedRevision: 0,
  title: "My task",
  nextAction: "My next step",
  section: "focus",
};
function events() {
  return database
    .select()
    .from(mcpEventOutbox)
    .all()
    .map(({ body }) => JSON.parse(body));
}
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "activity-mcp-events-"));
  const key = join(directory, "key");
  writeFileSync(key, randomBytes(32).toString("base64"), { mode: 0o600 });
  vi.stubEnv("TWITTER_LITE_CREDENTIAL_KEY_FILE", key);
  database = openDatabase(":memory:");
  for (const name of ["activity.created", "activity.status_changed"]) {
    await subscribeMcpEvent(
      {
        name,
        arguments: { origins: ["user", "agent"] },
        delivery: {
          mode: "webhook",
          url: "https://callback.invalid/events",
          secret: `whsec_${Buffer.alloc(32, 42).toString("base64")}`,
        },
      },
      database,
      {
        sender: async (_url, body) => ({
          status: 200,
          body: JSON.stringify({ challenge: JSON.parse(body).challenge }),
        }),
      },
    );
  }
});
afterEach(() => {
  database.$client.close();
  rmSync(directory, { recursive: true });
  vi.unstubAllEnvs();
});
it("records user creation once with the committed receipt and timestamp", () => {
  const receipt = createUserActivity(userInput, database);
  expect(createUserActivity(userInput, database)).toEqual(receipt);
  expect(events()).toEqual([
    expect.objectContaining({
      name: "activity.created",
      timestamp: receipt.receivedAt,
      data: {
        activityId: "task",
        kind: "task",
        title: "My task",
        nextAction: "My next step",
        state: "available",
        origin: "user",
        requestId: "create",
        revision: 1,
        occurredAt: receipt.receivedAt,
      },
    }),
  ]);
});
it("emits agent creation only for newly inserted IDs, including concrete replies", () => {
  const reply = {
    id: "reply",
    kind: "reply",
    title: "Respond to request",
    nextAction: "Check availability",
    sources: [
      {
        id: "message",
        kind: "message",
        provider: "beeper",
        targetId: "target",
        accountId: "account",
        chatId: "chat",
        messageId: "message",
        observedAt: new Date().toISOString(),
        excerpt: "Can we meet?",
      },
    ],
    reply: { recipientName: "Aoki", sourceId: "message", context: "Meeting request" },
  };
  const input = { requestId: "publish", expectedRevision: 0, activities: [task, reply] };
  const receipt = publishActivities(input, database);
  expect(publishActivities(input, database)).toEqual(receipt);
  publishActivities(
    {
      requestId: "update",
      expectedRevision: 1,
      activities: [{ ...task, title: "Updated suggestion" }],
    },
    database,
  );
  expect(
    events().map(({ name, data }) => ({
      name,
      id: data.activityId,
      kind: data.kind,
      origin: data.origin,
    })),
  ).toEqual([
    { name: "activity.created", id: "task", kind: "task", origin: "agent" },
    { name: "activity.created", id: "reply", kind: "reply", origin: "agent" },
  ]);
});
it("uses effective user overrides and emits only an actual state transition", () => {
  createUserActivity(userInput, database);
  publishActivities({ requestId: "suggest", expectedRevision: 1, activities: [task] }, database);
  updateActivityUser(
    { requestId: "edit", expectedRevision: 2, id: "task", overrides: { title: "My edited title" } },
    database,
  );
  updateActivityUser(
    { requestId: "same-state", expectedRevision: 3, id: "task", state: "available" },
    database,
  );
  const input = { requestId: "start", expectedRevision: 4, id: "task", state: "inProgress" };
  const receipt = updateActivityUser(input, database);
  expect(updateActivityUser(input, database)).toEqual(receipt);
  expect(events()).toHaveLength(2);
  expect(events()[1]).toMatchObject({
    name: "activity.status_changed",
    data: {
      previousState: "available",
      state: "inProgress",
      origin: "user",
      title: "My edited title",
      nextAction: "My next step",
      requestId: "start",
      revision: 5,
      occurredAt: receipt.receivedAt,
    },
  });
});
it("does not keep a creation event when a later item rolls back the batch", () => {
  createUserActivity(userInput, database);
  const invalidReply = {
    id: "task",
    kind: "reply",
    title: "Reply",
    nextAction: "Check",
    sources: [
      {
        id: "message",
        kind: "message",
        provider: "beeper",
        targetId: "target",
        accountId: "account",
        chatId: "chat",
        messageId: "message",
        observedAt: new Date().toISOString(),
        excerpt: "Question",
      },
    ],
    reply: { recipientName: "Aoki", sourceId: "message", context: "Request" },
  };
  expect(() =>
    publishActivities(
      {
        requestId: "bad-batch",
        expectedRevision: 1,
        activities: [{ ...task, id: "new-task" }, invalidReply],
      },
      database,
    ),
  ).toThrow(expect.objectContaining({ code: "immutable-field" }));
  expect(getActivityContext({}, database)).toMatchObject({
    revision: 1,
    activities: [{ id: "task" }],
  });
  expect(events()).toHaveLength(1);
});
it("rolls back the activity and receipt when outbox persistence fails", () => {
  database.$client.exec(
    "CREATE TRIGGER fail_event BEFORE INSERT ON mcp_event_outbox BEGIN SELECT RAISE(ABORT, 'event write failed'); END",
  );
  expect(() => createUserActivity(userInput, database)).toThrow("event write failed");
  expect(getActivityContext({}, database)).toMatchObject({ revision: 0, activities: [] });
  expect(events()).toEqual([]);
  database.$client.exec("DROP TRIGGER fail_event");
  expect(createUserActivity(userInput, database).revision).toBe(1);
  expect(events()).toHaveLength(1);
});

it("announces external completion once as an agent decision and rolls back failed evidence", () => {
  publishActivities({ requestId: "publish", expectedRevision: 0, activities: [task] }, database);
  const input = {
    requestId: "complete",
    expectedRevision: 1,
    id: task.id,
    reason: "The owner finished reading the proposal.",
    state: "completed",
    evidence: [
      {
        kind: "external",
        reference: "life/review.md",
        observedAt: "2026-10-09T01:00:00Z",
        summary: "Review recorded as finished.",
      },
    ],
  };
  expect(() =>
    updateActivityProgress(
      {
        ...input,
        evidence: [],
      },
      database,
    ),
  ).toThrow(expect.objectContaining({ code: "invalid-input" }));
  expect(events()).toHaveLength(1);
  const receipt = updateActivityProgress(input, database);
  expect(updateActivityProgress(input, database)).toEqual(receipt);
  expect(events()).toHaveLength(2);
  expect(events()[1]).toMatchObject({
    name: "activity.status_changed",
    data: {
      activityId: task.id,
      previousState: "available",
      state: "completed",
      origin: "agent",
      requestId: "complete",
      revision: 2,
    },
  });
});
