// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import {
  getActivityContext,
  publishActivities,
  updateActivityProgress,
  updateActivityUser,
} from "../activities/repository.server";
import {
  changeFocus,
  deleteWorkLog,
  getFocusContext,
  saveWorkLog,
  startFocus,
} from "./repository.server";
import { defaultFocusBudget, projectedRemainingSeconds, sessionActiveSeconds } from "./time";
let db: AppDatabase;
let request = 0;
const task = {
  id: "task",
  kind: "task",
  title: "Read report",
  nextAction: "Open report",
  sources: [],
  timeEstimate: { estimatedMinutes: 40, reason: "Read and annotate" },
};
const evidence = [
  {
    kind: "external",
    reference: "owner-note",
    observedAt: "2026-10-09T06:00:00Z",
    summary: "First section reviewed",
  },
];
const input = () => ({
  requestId: `r${++request}`,
  expectedRevision: getActivityContext({}, db).revision,
});
const time = () => {
  const value = getActivityContext({ activityIds: ["task"] }, db).activities[0]?.time;
  if (!value) throw new Error("Missing time");
  return value;
};
const session = () => {
  const value = getFocusContext({}, db).session;
  if (!value) throw new Error("Missing session");
  return value;
};
const progress = (remainingMinutes: number) =>
  updateActivityProgress(
    { ...input(), id: "task", remainingMinutes, reason: "First section reviewed", evidence },
    db,
  );
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T06:00:00Z"));
  db = openDatabase(":memory:");
  publishActivities({ ...input(), activities: [task] }, db);
});
afterEach(() => {
  db.$client.close();
  vi.useRealTimers();
});
it("keeps task estimate independent of focus budget and restores pause/restart elapsed", () => {
  startFocus({ ...input(), activityId: "task", budgetSeconds: 900 }, db);
  vi.advanceTimersByTime(900000);
  expect(time().projectedRemainingSeconds).toBe(1500);
  expect(getActivityContext({}, db).activities[0]?.userState).toBe("inProgress");
  changeFocus({ ...input(), sessionId: session().id, action: "pause" }, db);
  vi.advanceTimersByTime(900000);
  expect(time().activeSeconds).toBe(900);
  changeFocus({ ...input(), sessionId: session().id, action: "resume" }, db);
  expect(time().projectedRemainingSeconds).toBe(1500);
  expect(time().estimatedMinutes).toBe(40);
});
it("replays receipts without creating a second session or log and rejects stale competing actions", () => {
  const start = { ...input(), activityId: "task" };
  const receipt = startFocus(start, db);
  expect(startFocus(start, db)).toEqual(receipt);
  expect(() => startFocus({ ...input(), activityId: "task" }, db)).toThrow(/unfinished/);
  vi.advanceTimersByTime(2000);
  const end = { ...input(), sessionId: session().id, action: "end" };
  changeFocus(end, db);
  changeFocus(end, db);
  expect(getFocusContext({ activityId: "task" }, db).workLogs).toHaveLength(1);
  expect(time().actualSeconds).toBe(2);
  expect(() => changeFocus({ ...end, requestId: "competing" }, db)).toThrow(/changed/);
});
it("owner estimates survive AI updates and reset independently", () => {
  updateActivityUser(
    { ...input(), id: "task", overrides: { estimatedMinutes: 50, remainingMinutes: 30 } },
    db,
  );
  progress(10);
  publishActivities(
    {
      ...input(),
      activities: [{ ...task, timeEstimate: { estimatedMinutes: 60, reason: "More sections" } }],
    },
    db,
  );
  expect(time()).toMatchObject({
    estimatedMinutes: 50,
    estimateOrigin: "user",
    remainingOrigin: "user",
    projectedRemainingSeconds: 1800,
  });
  updateActivityUser({ ...input(), id: "task", resetOverrides: ["remainingMinutes"] }, db);
  expect(time()).toMatchObject({
    estimatedMinutes: 50,
    remainingOrigin: "agent",
    projectedRemainingSeconds: 600,
  });
  updateActivityUser({ ...input(), id: "task", resetOverrides: ["estimatedMinutes"] }, db);
  expect(time()).toMatchObject({ estimatedMinutes: 60, estimateOrigin: "agent" });
});
it("finalizes focus once when an external assessment completes the task", () => {
  startFocus({ ...input(), activityId: "task" }, db);
  vi.advanceTimersByTime(65000);
  updateActivityProgress(
    {
      ...input(),
      id: "task",
      state: "completed",
      remainingMinutes: 0,
      reason: "Reply observed externally",
      evidence,
    },
    db,
  );
  expect(getFocusContext({}, db).session).toBeNull();
  expect(time().actualSeconds).toBe(65);
  expect(getFocusContext({ activityId: "task" }, db).workLogs).toHaveLength(1);
});
it("allows unestimated tasks to start without inventing estimates and freezes initial null", () => {
  publishActivities({ ...input(), activities: [{ ...task, timeEstimate: undefined }] }, db);
  startFocus({ ...input(), activityId: "task" }, db);
  expect(session().budgetSeconds).toBe(900);
  expect(time().estimatedMinutes).toBeNull();
  publishActivities({ ...input(), activities: [task] }, db);
  expect(time().initialEstimatedMinutes).toBeNull();
});
it("corrects logs before an estimate without changing its remaining prediction", () => {
  saveWorkLog(
    {
      ...input(),
      id: "manual",
      activityId: "task",
      durationSeconds: 600,
      occurredOn: "2026-10-09",
    },
    db,
  );
  progress(20);
  saveWorkLog(
    {
      ...input(),
      id: "manual",
      activityId: "task",
      durationSeconds: 300,
      occurredOn: "2026-10-09",
    },
    db,
  );
  expect(time().projectedRemainingSeconds).toBe(1200);
  deleteWorkLog({ ...input(), id: "manual" }, db);
  expect(time().projectedRemainingSeconds).toBe(1200);
});
it("proportionally corrects a timer log spanning a remaining estimate", () => {
  startFocus({ ...input(), activityId: "task" }, db);
  vi.advanceTimersByTime(600000);
  progress(20);
  vi.advanceTimersByTime(600000);
  changeFocus({ ...input(), sessionId: session().id, action: "end" }, db);
  const log = getFocusContext({ activityId: "task" }, db).workLogs[0];
  if (!log) throw new Error("Missing log");
  expect(time().projectedRemainingSeconds).toBe(600);
  saveWorkLog(
    { ...input(), id: log.id, activityId: "task", durationSeconds: 600, occurredOn: "2026-10-09" },
    db,
  );
  expect(time().projectedRemainingSeconds).toBe(900);
  deleteWorkLog({ ...input(), id: log.id }, db);
  expect(time().projectedRemainingSeconds).toBe(1200);
});
it("switches tasks explicitly and rejects focus on waiting activities", () => {
  publishActivities({ ...input(), activities: [{ ...task, id: "other" }] }, db);
  startFocus({ ...input(), activityId: "task" }, db);
  vi.advanceTimersByTime(10000);
  startFocus({ ...input(), activityId: "other", switchCurrent: true }, db);
  expect(session().activityId).toBe("other");
  expect(time().actualSeconds).toBe(10);
  updateActivityUser({ ...input(), id: "other", state: "waiting" }, db);
  expect(getFocusContext({}, db).session).toBeNull();
  expect(() => startFocus({ ...input(), activityId: "other" }, db)).toThrow(/state/);
});
it("calculates gentle default budgets and never negative remaining time", () => {
  expect(defaultFocusBudget(null)).toBe(900);
  expect(defaultFocusBudget(0)).toBe(900);
  expect(defaultFocusBudget(61)).toBe(120);
  expect(defaultFocusBudget(2400)).toBe(1500);
  expect(projectedRemainingSeconds(null, 500)).toBeNull();
  expect(projectedRemainingSeconds(10, 900)).toBe(0);
  startFocus({ ...input(), activityId: "task" }, db);
  const s = session();
  expect(sessionActiveSeconds(s, s.startedAt - 1000)).toBe(0);
});
it("emits one time event for finalization plus remaining update and none for ticks or hidden AI estimates", () => {
  db.$client
    .prepare(
      "INSERT INTO mcp_event_subscriptions (id,owner,name,arguments_json,callback_url,secret_ciphertext,verified_at,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "time",
      "private-workspace",
      "activity.time_changed",
      JSON.stringify({ origins: ["user", "agent"] }),
      "https://example.invalid/events",
      "unused",
      Date.now(),
      Date.now() + 86400000,
      Date.now(),
      Date.now(),
    );
  startFocus({ ...input(), activityId: "task" }, db);
  vi.advanceTimersByTime(10000);
  expect(db.$client.prepare("SELECT count(*) AS n FROM mcp_event_outbox").get()).toEqual({ n: 0 });
  const finish = {
    ...input(),
    id: "task",
    state: "completed",
    remainingMinutes: 0,
    reason: "Finished externally",
    evidence,
  };
  updateActivityProgress(finish, db);
  updateActivityProgress(finish, db);
  const rows = db.$client.prepare("SELECT body FROM mcp_event_outbox").all() as { body: string }[];
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0]?.body ?? "{}").data.changedFields).toEqual([
    "actualSeconds",
    "remainingMinutes",
  ]);
  updateActivityUser(
    { ...input(), id: "task", overrides: { estimatedMinutes: 20, remainingMinutes: 5 } },
    db,
  );
  const count = db.$client.prepare("SELECT count(*) AS n FROM mcp_event_outbox").get();
  progress(10);
  publishActivities(
    {
      ...input(),
      activities: [{ ...task, timeEstimate: { estimatedMinutes: 60, reason: "Changed scope" } }],
    },
    db,
  );
  expect(db.$client.prepare("SELECT count(*) AS n FROM mcp_event_outbox").get()).toEqual(count);
});
it("keeps a pre-estimate log correction ratio when zeroed and restored", () => {
  saveWorkLog(
    {
      ...input(),
      id: "manual",
      activityId: "task",
      durationSeconds: 600,
      occurredOn: "2026-10-09",
    },
    db,
  );
  progress(10);
  saveWorkLog(
    { ...input(), id: "manual", activityId: "task", durationSeconds: 0, occurredOn: "2026-10-09" },
    db,
  );
  saveWorkLog(
    {
      ...input(),
      id: "manual",
      activityId: "task",
      durationSeconds: 600,
      occurredOn: "2026-10-09",
    },
    db,
  );
  expect(time().projectedRemainingSeconds).toBe(600);
});
it("keeps a spanning-session correction ratio when zeroed and restored", () => {
  startFocus({ ...input(), activityId: "task" }, db);
  vi.advanceTimersByTime(600000);
  progress(20);
  vi.advanceTimersByTime(600000);
  changeFocus({ ...input(), sessionId: session().id, action: "end" }, db);
  const log = getFocusContext({ activityId: "task" }, db).workLogs[0];
  if (!log) throw new Error("Missing log");
  saveWorkLog(
    { ...input(), id: log.id, activityId: "task", durationSeconds: 0, occurredOn: "2026-10-09" },
    db,
  );
  expect(time().projectedRemainingSeconds).toBe(1200);
  saveWorkLog(
    { ...input(), id: log.id, activityId: "task", durationSeconds: 1200, occurredOn: "2026-10-09" },
    db,
  );
  expect(time().projectedRemainingSeconds).toBe(600);
});
it("records timer work on the owner's start date across UTC midnight and persists the zone", () => {
  vi.setSystemTime(new Date("2026-10-09T15:30:00Z"));
  startFocus({ ...input(), activityId: "task", timeZone: "Asia/Tokyo" }, db);
  expect(session().timeZone).toBe("Asia/Tokyo");
  vi.advanceTimersByTime(60000);
  changeFocus({ ...input(), sessionId: session().id, action: "end" }, db);
  expect(getFocusContext({ activityId: "task" }, db).workLogs[0]?.occurredOn).toBe("2026-10-10");
  expect(() => startFocus({ ...input(), activityId: "task", timeZone: "not-a-zone" }, db)).toThrow(
    /fields/,
  );
});
