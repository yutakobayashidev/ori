// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import { subscribeActivities } from "./events.server";
import type { ActivityProposal } from "./model";
import {
  createUserActivity,
  updateActivityProgress,
  getActivityContext,
  publishActivities,
  updateActivityUser,
} from "./repository.server";
let directory: string;
let database: AppDatabase;
let second: AppDatabase;
const task: ActivityProposal = {
  id: "detergent",
  kind: "task",
  title: "Buy detergent",
  nextAction: "Buy one refill",
  sources: [],
};
const reply: ActivityProposal = {
  id: "review",
  kind: "reply",
  title: "Review materials and suggest meeting times",
  nextAction: "Read the materials",
  sources: [
    {
      id: "request",
      kind: "message",
      provider: "beeper",
      targetId: "personal",
      accountId: "work",
      chatId: "aoki",
      messageId: "message-one",
      observedAt: "2026-10-07T01:00:00Z",
      excerpt: "Please suggest meeting times",
    },
  ],
  reply: {
    recipientName: "Aoki",
    sourceId: "request",
    context: "Review meeting",
    draft: "Monday works.",
  },
};
function publish(
  proposals: ActivityProposal[] = [task, reply],
  expectedRevision = 0,
  requestId = "publish-one",
) {
  return publishActivities({ requestId, expectedRevision, activities: proposals }, database);
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "workspace-activities-"));
  database = openDatabase(join(directory, "app.db"));
  second = openDatabase(join(directory, "app.db"));
});
afterEach(() => {
  database.$client.close();
  second.$client.close();
  rmSync(directory, { recursive: true });
});
it("persists a shared inbox of chores and concrete replies across reopening", () => {
  publish();
  second.$client.close();
  second = openDatabase(join(directory, "app.db"));
  expect(getActivityContext({}, second)).toMatchObject({
    ok: true,
    revision: 1,
    activities: [
      { id: "detergent", userState: "available", effective: { kind: "task", section: "optional" } },
      { id: "review", effective: { kind: "reply", reply: reply.reply } },
    ],
    nextCursor: null,
  });
});
it("replays the original receipt before checking a now stale revision without notifying twice", () => {
  const listener = vi.fn<() => void>();
  const unsubscribe = subscribeActivities(listener);
  const result = publish();
  expect(publish()).toEqual(result);
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  expect(getActivityContext({}, database).revision).toBe(1);
});
it("rejects reuse of a request ID with a changed payload", () => {
  publish();
  expect(() => publish([{ ...task, title: "Something else" }])).toThrow(
    expect.objectContaining({ code: "idempotency-conflict" }),
  );
});
it("compares normalized object keys when retrying", () => {
  const first = publish([task]);
  expect(
    publishActivities(
      {
        activities: [
          {
            sources: [],
            nextAction: task.nextAction,
            title: task.title,
            kind: "task",
            id: task.id,
          },
        ],
        expectedRevision: 0,
        requestId: "publish-one",
      },
      second,
    ),
  ).toEqual(first);
});
it("preserves user edits and state while replacing the proposal", () => {
  publish();
  updateActivityUser(
    {
      requestId: "edit",
      expectedRevision: 1,
      id: "review",
      state: "deferred",
      overrides: { title: "Check scope first", draft: "", section: "focus" },
    },
    second,
  );
  publish(
    [{ ...reply, title: "New suggestion", reply: { ...reply.reply, draft: "Tuesday works." } }],
    2,
    "publish-two",
  );
  expect(getActivityContext({ activityIds: ["review"] }, database).activities[0]).toMatchObject({
    proposal: { title: "New suggestion", reply: { draft: "Tuesday works." } },
    userState: "deferred",
    effective: { title: "Check scope first", section: "focus", reply: { draft: "" } },
  });
  updateActivityUser(
    {
      requestId: "reset",
      expectedRevision: 3,
      id: "review",
      resetOverrides: ["draft", "title", "section"],
    },
    database,
  );
  expect(getActivityContext({ activityIds: ["review"] }, database).activities[0]).toMatchObject({
    userState: "deferred",
    userOverrides: {},
    effective: { title: "New suggestion", section: "optional", reply: { draft: "Tuesday works." } },
  });
});
it.each(["completed", "deferred", "dismissed"] as const)(
  "does not revive a %s task on republication",
  (state) => {
    publish([task]);
    updateActivityUser(
      { requestId: "decision", expectedRevision: 1, id: task.id, state },
      database,
    );
    publish([{ ...task, detail: "Updated context" }], 2, "update");
    expect(getActivityContext({}, database).activities[0]?.userState).toBe(state);
  },
);
it("checks user changes against global revision and replays user receipts", () => {
  publish();
  const input = { requestId: "edit", expectedRevision: 1, id: task.id, state: "completed" };
  const receipt = updateActivityUser(input, second);
  expect(updateActivityUser(input, database)).toEqual(receipt);
  expect(() =>
    updateActivityUser({ ...input, requestId: "stale", state: "deferred" }, database),
  ).toThrow(expect.objectContaining({ code: "revision-conflict" }));
});
it("rolls back the entire batch when a later activity changes its reply destination", () => {
  publish([reply]);
  const changed = {
    ...reply,
    sources: reply.sources.map((source) => ({ ...source, chatId: "other-chat" })),
  };
  expect(() => publish([task, changed], 1, "invalid-batch")).toThrow(
    expect.objectContaining({ code: "immutable-field" }),
  );
  expect(getActivityContext({}, database)).toMatchObject({
    revision: 1,
    activities: [{ id: reply.id }],
  });
});
it("rejects changing the kind of an existing activity", () => {
  publish([task]);
  expect(() => publish([{ ...reply, id: task.id }], 1, "changed-kind")).toThrow(
    expect.objectContaining({ code: "immutable-field" }),
  );
});
it.each(["user", "agent"] as const)(
  "allows %s completion of an externally handled reply independently",
  (origin) => {
    publish([reply, { ...reply, id: "send-final-materials" }]);
    updateActivityUser(
      { requestId: "defer", expectedRevision: 1, id: "review", state: "deferred" },
      database,
    );
    updateActivityUser(
      { requestId: "externally-replied", expectedRevision: 2, id: "review", state: "completed" },
      database,
      origin,
    );
    expect(
      getActivityContext({ activityIds: ["review"] }, database).activities[0]?.assessment,
    ).toBeNull();
    expect(
      getActivityContext({}, database).activities.map(({ id, userState }) => ({ id, userState })),
    ).toEqual([
      { id: "review", userState: "completed" },
      { id: "send-final-materials", userState: "available" },
    ]);
  },
);
it("returns missing IDs and pages in ID order with a revision-bound cursor", () => {
  publish([reply, task]);
  const first = getActivityContext(
    { activityIds: ["review", "missing", "detergent"], limit: 1 },
    database,
  );
  expect(first.activities.map((item) => item.id)).toEqual(["detergent"]);
  expect(first.missingActivityIds).toEqual(["missing"]);
  expect(first.nextCursor).toEqual(expect.any(String));
  const next = getActivityContext(
    { activityIds: ["detergent", "review", "missing"], limit: 1, cursor: first.nextCursor },
    second,
  );
  expect(next.activities.map((item) => item.id)).toEqual(["review"]);
  expect(next.nextCursor).toBeNull();
  updateActivityUser(
    { requestId: "change", expectedRevision: 1, id: task.id, state: "completed" },
    second,
  );
  expect(() =>
    getActivityContext(
      { activityIds: ["review", "missing", "detergent"], limit: 1, cursor: first.nextCursor },
      database,
    ),
  ).toThrow(expect.objectContaining({ code: "stale-cursor" }));
});
it.each([
  { ...task, unknown: true },
  { ...task, userState: "completed" },
  { ...task, reply: reply.reply },
  { ...reply, reply: { ...reply.reply, sourceId: "missing" } },
  { ...reply, sources: [...reply.sources, ...reply.sources] },
  {
    ...task,
    sources: [
      {
        id: "life",
        kind: "life",
        path: "../secret",
        contentHash: "a".repeat(64),
        observedAt: "2026-10-07T01:00:00Z",
      },
    ],
  },
])("rejects invalid proposal before any write %#", (proposal) => {
  expect(() =>
    publishActivities(
      { requestId: "bad", expectedRevision: 0, activities: [task, proposal] },
      database,
    ),
  ).toThrow(expect.objectContaining({ code: "invalid-input" }));
  expect(getActivityContext({}, database).revision).toBe(0);
});
it("rejects duplicate IDs in one batch", () => {
  expect(() => publish([task, task])).toThrow(expect.objectContaining({ code: "invalid-input" }));
});
it("bounds UTF-8 publication size", () => {
  expect(() =>
    publishActivities(
      {
        requestId: "large",
        expectedRevision: 0,
        activities: [{ ...task, detail: "あ".repeat(90000) }],
      },
      database,
    ),
  ).toThrow(expect.objectContaining({ code: "payload-too-large" }));
});
it("rejects stale publication without partial writes", () => {
  publish([reply]);
  expect(() => publish([task], 0, "stale")).toThrow(
    expect.objectContaining({ code: "revision-conflict" }),
  );
  expect(getActivityContext({}, database).activities).toHaveLength(1);
});

it("preserves explicitly entered Home content when an agent publishes new suggestions", () => {
  const input = {
    requestId: "user-created",
    expectedRevision: 0,
    id: task.id,
    title: "My title",
    nextAction: "My next step",
    section: "focus",
  };
  const receipt = createUserActivity(input, database);
  expect(createUserActivity(input, second)).toEqual(receipt);
  publish([{ ...task, title: "Agent title", nextAction: "Agent step" }], 1, "agent-update");
  expect(getActivityContext({}, database).activities[0]).toMatchObject({
    proposal: { title: "Agent title" },
    effective: { title: "My title", nextAction: "My next step", section: "focus" },
  });
});
it("does not move the original message anchor when a newer message arrives", () => {
  publish([reply]);
  expect(() =>
    publish(
      [
        {
          ...reply,
          sources: reply.sources.map((source) => ({ ...source, messageId: "new-message" })),
        },
      ],
      1,
      "move-anchor",
    ),
  ).toThrow(expect.objectContaining({ code: "immutable-field" }));
});
it("removes omitted optional proposal fields without deleting untouched activities", () => {
  publish([{ ...task, detail: "Old context", recommendation: { section: "focus" } }, reply]);
  publish([task], 1, "replace");
  const context = getActivityContext({}, database);
  expect(context.activities).toHaveLength(2);
  expect(context.activities[0]?.proposal).not.toHaveProperty("detail");
  expect(context.activities[0]?.effective.section).toBe("optional");
});
it("rejects using a cursor with a different filter", () => {
  publish();
  const first = getActivityContext({ limit: 1 }, database);
  expect(() =>
    getActivityContext({ limit: 1, activityIds: ["review"], cursor: first.nextCursor }, database),
  ).toThrow(expect.objectContaining({ code: "invalid-input" }));
});
it("does not announce a failed transaction", () => {
  publish();
  const listener = vi.fn<() => void>();
  const unsubscribe = subscribeActivities(listener);
  expect(() => publish([task], 0, "stale-request")).toThrow(
    expect.objectContaining({ code: "revision-conflict" }),
  );
  expect(listener).not.toHaveBeenCalled();
  unsubscribe();
});

const progress = {
  requestId: "progress",
  expectedRevision: 1,
  id: "review",
  state: "completed" as const,
  reason: "The other participant confirmed the request was resolved.",
  evidence: [
    {
      kind: "beeper_message" as const,
      targetId: "personal",
      accountId: "work",
      chatId: "aoki",
      messageId: "incoming-confirmation",
    },
  ],
};
it("persists reported incoming evidence and replays once across connections", () => {
  publish();
  const listener = vi.fn<() => void>();
  const unsubscribe = subscribeActivities(listener);
  const receipt = updateActivityProgress(progress, database);
  expect(updateActivityProgress(progress, second)).toEqual(receipt);
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  expect(getActivityContext({ activityIds: ["review"] }, second)).toMatchObject({
    revision: 2,
    activities: [
      {
        userState: "completed",
        assessment: {
          reason: progress.reason,
          evidence: progress.evidence,
          updatedAt: receipt.receivedAt,
        },
      },
    ],
  });
});
it("partially updates the proposed draft while preserving owner text and state", () => {
  publish();
  updateActivityUser(
    {
      requestId: "owner",
      expectedRevision: 1,
      id: "review",
      state: "waiting",
      overrides: { draft: "My wording", title: "My title" },
    },
    database,
  );
  updateActivityProgress(
    { ...progress, state: undefined, expectedRevision: 2, draft: "Suggested wording" },
    database,
  );
  expect(getActivityContext({ activityIds: ["review"] }, database).activities[0]).toMatchObject({
    userState: "waiting",
    proposal: { reply: { draft: "Suggested wording" } },
    effective: { title: "My title", reply: { draft: "My wording" } },
  });
});
it("accepts reported external context for replies and can reopen with the latest revision", () => {
  publish();
  updateActivityProgress(
    {
      ...progress,
      evidence: [
        {
          kind: "external",
          reference: "Discord conversation",
          observedAt: "2026-10-09T01:00:00Z",
          summary: "Owner confirmed resolution",
        },
      ],
    },
    database,
  );
  updateActivityProgress(
    {
      ...progress,
      requestId: "reopen",
      expectedRevision: 2,
      state: "inProgress",
      evidence: [{ ...progress.evidence[0], chatId: "another-conversation" }],
    },
    database,
  );
  expect(getActivityContext({ activityIds: ["review"] }, database).activities[0]?.userState).toBe(
    "inProgress",
  );
});
it("rejects stale decisions, changed reruns, task drafts and empty changes atomically", () => {
  publish();
  expect(() => updateActivityProgress({ ...progress, expectedRevision: 0 }, database)).toThrow(
    expect.objectContaining({ code: "revision-conflict" }),
  );
  expect(() =>
    updateActivityProgress({ ...progress, id: task.id, draft: "Invalid" }, database),
  ).toThrow(expect.objectContaining({ code: "invalid-input" }));
  expect(() => updateActivityProgress({ ...progress, state: undefined }, database)).toThrow(
    expect.objectContaining({ code: "invalid-input" }),
  );
  expect(() => updateActivityProgress({ ...progress, evidence: [] }, database)).toThrow(
    expect.objectContaining({ code: "invalid-input" }),
  );
  updateActivityProgress(progress, database);
  expect(() => updateActivityProgress({ ...progress, reason: "Changed" }, database)).toThrow(
    expect.objectContaining({ code: "idempotency-conflict" }),
  );
  expect(getActivityContext({}, database).revision).toBe(2);
});
it("preserves the assessment on republication and clears it when the owner changes state", () => {
  publish();
  updateActivityProgress(progress, database);
  publish([reply], 2, "refresh");
  expect(
    getActivityContext({ activityIds: ["review"] }, database).activities[0]?.assessment?.reason,
  ).toBe(progress.reason);
  updateActivityUser(
    { requestId: "owner", expectedRevision: 3, id: "review", state: "available" },
    database,
  );
  expect(
    getActivityContext({ activityIds: ["review"] }, database).activities[0]?.assessment,
  ).toBeNull();
});
it("filters source conversations and states before pagination without reporting filtered IDs missing", () => {
  publish([
    task,
    reply,
    { ...reply, id: "reply-two" },
    {
      ...reply,
      id: "other-account",
      sources: reply.sources.map((s) => (s.kind === "message" ? { ...s, accountId: "other" } : s)),
    },
  ]);
  const conversation = { targetId: "personal", accountId: "work", chatId: "aoki" };
  const input = {
    conversation,
    states: ["available"],
    activityIds: ["review", "reply-two", "other-account", "detergent", "absent"],
    limit: 1,
  };
  const first = getActivityContext(input, database);
  expect(first.activities.map((x) => x.id)).toEqual(["reply-two"]);
  expect(first.missingActivityIds).toEqual(["absent"]);
  expect(first.nextCursor).not.toBeNull();
  expect(
    getActivityContext(
      { ...input, states: ["available", "available"], cursor: first.nextCursor },
      database,
    ).activities.map((x) => x.id),
  ).toEqual(["review"]);
  expect(() =>
    getActivityContext({ ...input, states: ["waiting"], cursor: first.nextCursor }, database),
  ).toThrow(expect.objectContaining({ code: "invalid-input" }));
  expect(getActivityContext({ conversation, states: ["waiting"] }, database).activities).toEqual(
    [],
  );
});
