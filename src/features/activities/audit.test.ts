// @vitest-environment node
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import { getActivityAudit, withActivityAuditContext } from "./audit.server";
import {
  createUserActivity,
  getActivityContext,
  publishActivities,
  updateActivityUser,
} from "./repository.server";
import {
  changeFocus,
  deleteWorkLog,
  getFocusContext,
  saveWorkLog,
  startFocus,
} from "../focus/repository.server";

let database: AppDatabase;
beforeEach(() => {
  database = openDatabase(":memory:");
});
afterEach(() => {
  database.$client.close();
});
const create = (id = "task", expectedRevision = 0) =>
  createUserActivity(
    {
      requestId: `create-${id}`,
      expectedRevision,
      id,
      title: id,
      nextAction: "Begin",
      section: "optional",
    },
    database,
  );

it("stores full content before and after with trusted caller attribution", () => {
  create();
  withActivityAuditContext({ actor: "agent", channel: "mcp" }, () =>
    updateActivityUser(
      {
        requestId: "edit",
        expectedRevision: 1,
        id: "task",
        overrides: { title: "Changed", nextAction: "Full content" },
        state: "completed",
      },
      database,
    ),
  );
  expect(getActivityAudit({}, database).entries).toMatchObject([
    {
      actor: "agent",
      channel: "mcp",
      requestId: "edit",
      before: {
        proposal: { title: "task" },
        userState: "available",
        userOverrides: { title: "task" },
      },
      after: {
        userState: "completed",
        userOverrides: { title: "Changed", nextAction: "Full content" },
      },
    },
    { before: null, after: { proposal: { title: "task" }, number: 1 } },
  ]);
});
it("retains complete reply drafts in history", () => {
  publishActivities(
    {
      requestId: "publish",
      expectedRevision: 0,
      activities: [
        {
          id: "reply",
          kind: "reply",
          title: "Reply",
          nextAction: "Review",
          sources: [
            {
              id: "source",
              kind: "message",
              provider: "beeper",
              targetId: "personal",
              accountId: "account",
              chatId: "chat",
              messageId: "message",
              observedAt: "2026-10-01T00:00:00Z",
              excerpt: "Original message",
            },
          ],
          reply: {
            sourceId: "source",
            recipientName: "Recipient",
            context: "Context",
            draft: "Original draft",
          },
        },
      ],
    },
    database,
  );
  updateActivityUser(
    {
      requestId: "draft",
      expectedRevision: 1,
      id: "reply",
      overrides: { draft: "Complete private draft" },
    },
    database,
  );
  expect(getActivityAudit({}, database).entries[0]).toMatchObject({
    before: { proposal: { reply: { draft: "Original draft" } } },
    after: { userOverrides: { draft: "Complete private draft" } },
  });
});
it("does not append history for receipt replay, stale requests, or unchanged content", () => {
  const receipt = create();
  expect(create()).toEqual(receipt);
  updateActivityUser(
    { requestId: "noop", expectedRevision: 1, id: "task", state: "available" },
    database,
  );
  expect(() =>
    updateActivityUser(
      { requestId: "stale", expectedRevision: 0, id: "task", state: "completed" },
      database,
    ),
  ).toThrow("Activities changed");
  expect(getActivityAudit({}, database).entries).toHaveLength(1);
});
it("rolls back task, number, revision, and receipt if audit persistence fails", () => {
  database.$client.exec(
    "CREATE TRIGGER fail_audit BEFORE INSERT ON activity_audit BEGIN SELECT RAISE(ABORT, 'audit failed'); END",
  );
  expect(() => create()).toThrow("audit failed");
  expect(getActivityContext({}, database)).toMatchObject({ revision: 0, activities: [] });
  database.$client.exec("DROP TRIGGER fail_audit");
  expect(create().revision).toBe(1);
  expect(getActivityAudit({}, database).entries).toMatchObject([{ after: { number: 1 } }]);
});
it("records both tasks during a focus switch and completion resolved from session id", () => {
  create("first");
  create("second", 1);
  startFocus(
    { requestId: "focus-first", expectedRevision: 2, activityId: "first", timeZone: "UTC" },
    database,
  );
  startFocus(
    {
      requestId: "switch",
      expectedRevision: 3,
      activityId: "second",
      timeZone: "UTC",
      switchCurrent: true,
    },
    database,
  );
  expect(
    getActivityAudit({}, database)
      .entries.filter((entry) => entry.requestId === "switch")
      .sort((a, b) => a.activityId.localeCompare(b.activityId)),
  ).toMatchObject(
    [
      {
        activityId: "second",
        before: { userState: "available" },
        after: { userState: "inProgress" },
      },
      { activityId: "first", after: { focusSessions: [{ state: "ended" }] } },
    ].sort((a, b) => a.activityId.localeCompare(b.activityId)),
  );
  const session = getFocusContext({}, database).session ?? undefined;
  expect(session).toBeDefined();
  changeFocus(
    { requestId: "finish", expectedRevision: 4, sessionId: session?.id, action: "complete" },
    database,
  );
  expect(getActivityAudit({}, database).entries[0]).toMatchObject({
    activityId: "second",
    before: { userState: "inProgress" },
    after: { userState: "completed" },
  });
});
it("records manual work log removal and paginates without duplicates when new entries arrive", () => {
  create();
  saveWorkLog(
    {
      requestId: "log",
      expectedRevision: 1,
      activityId: "task",
      id: "log",
      durationSeconds: 60,
      occurredOn: "2026-10-11",
      note: "Work note",
    },
    database,
  );
  const first = getActivityAudit({ activityId: "task", limit: 1 }, database);
  deleteWorkLog({ requestId: "delete", expectedRevision: 2, id: "log" }, database);
  expect(getActivityAudit({}, database).entries[0]).toMatchObject({
    before: { workLogs: [{ note: "Work note" }] },
    after: { workLogs: [] },
  });
  expect(
    getActivityAudit({ activityId: "task", beforeId: first.nextBeforeId, limit: 1 }, database)
      .entries,
  ).toMatchObject([{ operation: "user-create" }]);
  expect(getActivityAudit({ activityId: "other" }, database).entries).toEqual([]);
});
