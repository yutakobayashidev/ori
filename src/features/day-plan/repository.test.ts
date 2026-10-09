// @vitest-environment node
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import { publishActivities } from "../activities/repository.server";
import { getDayPlan, updateDayPlan } from "./repository.server";
import { localDay } from "./model";
let database: AppDatabase;
const day = { date: "2026-10-09", timeZone: "Asia/Tokyo" };
beforeEach(() => {
  database = openDatabase(":memory:");
  publishActivities(
    {
      requestId: "publish",
      expectedRevision: 0,
      activities: ["a", "b"].map((id) => ({
        id,
        kind: "task",
        title: id,
        nextAction: "Work",
        sources: [],
      })),
    },
    database,
  );
});
afterEach(() => database.$client.close());
function change(activityId: string, excluded = false, rank = 0) {
  return { activityId, section: "focus" as const, rank, excluded };
}
it("publication does not select today and yesterday is never copied forward", () => {
  expect(getDayPlan(day, database).selections).toEqual([]);
  updateDayPlan(
    {
      ...day,
      requestId: "today",
      expectedRevision: 1,
      reason: "Useful next step",
      changes: [change("a")],
    },
    "agent",
    database,
  );
  expect(getDayPlan({ ...day, date: "2026-10-10" }, database).selections).toEqual([]);
  expect(getDayPlan(day, database).selections[0]?.activityId).toBe("a");
});
it("owner exclusions survive AI reselection and atomically roll back other changes", () => {
  updateDayPlan(
    {
      ...day,
      requestId: "exclude",
      expectedRevision: 1,
      reason: "Not today",
      changes: [change("a", true)],
    },
    "user",
    database,
  );
  expect(() =>
    updateDayPlan(
      {
        ...day,
        requestId: "agent",
        expectedRevision: 2,
        reason: "New candidates",
        changes: [change("b"), change("a")],
      },
      "agent",
      database,
    ),
  ).toThrow("adjusted by the owner");
  const plan = getDayPlan(day, database);
  expect(plan.revision).toBe(2);
  expect(plan.selections).toHaveLength(1);
  expect(plan.selections[0]).toMatchObject({ activityId: "a", excluded: true, origin: "user" });
  updateDayPlan(
    {
      ...day,
      requestId: "restore",
      expectedRevision: 2,
      reason: "Ready now",
      changes: [change("a")],
    },
    "user",
    database,
  );
  expect(getDayPlan(day, database).selections[0]?.excluded).toBe(false);
});
it("preserves owner order and handles retries and stale revisions", () => {
  const input = {
    ...day,
    requestId: "select",
    expectedRevision: 1,
    reason: "Owner order",
    changes: [change("a", false, 1), change("b", false, 0)],
  };
  const receipt = updateDayPlan(input, "user", database);
  expect(updateDayPlan(input, "user", database)).toEqual(receipt);
  expect(getDayPlan(day, database).selections.map((entry) => entry.activityId)).toEqual(["b", "a"]);
  expect(() => updateDayPlan({ ...input, changes: [change("a")] }, "user", database)).toThrow(
    "different input",
  );
  expect(() => updateDayPlan({ ...input, requestId: "stale" }, "user", database)).toThrow(
    "Read the latest context",
  );
  expect(() =>
    updateDayPlan({ ...input, requestId: "ai", expectedRevision: 2 }, "agent", database),
  ).toThrow("adjusted by the owner");
});
it("validates dates and zones and keeps one record per calendar date and activity", () => {
  expect(() => getDayPlan({ ...day, date: "2026-02-30" }, database)).toThrow(
    "Choose a valid date and IANA time zone.",
  );
  expect(() => getDayPlan({ ...day, timeZone: "not-a-zone" }, database)).toThrow(
    "Choose a valid date and IANA time zone.",
  );
  updateDayPlan(
    { ...day, requestId: "one", expectedRevision: 1, reason: "Here", changes: [change("a")] },
    "user",
    database,
  );
  updateDayPlan(
    {
      ...day,
      timeZone: "Europe/London",
      requestId: "two",
      expectedRevision: 2,
      reason: "Travelling",
      changes: [change("a", false, 2)],
    },
    "user",
    database,
  );
  expect(getDayPlan(day, database).selections).toHaveLength(1);
  expect(localDay(new Date("2026-10-09T16:00:00Z"), "Asia/Tokyo").date).toBe("2026-10-10");
});
it("new AI candidates cannot push ahead of the owner's chosen order", () => {
  updateDayPlan(
    {
      ...day,
      requestId: "owner-first",
      expectedRevision: 1,
      reason: "Start with this",
      changes: [change("a")],
    },
    "user",
    database,
  );
  expect(() =>
    updateDayPlan(
      {
        ...day,
        requestId: "agent-first",
        expectedRevision: 2,
        reason: "Another task",
        changes: [change("b")],
      },
      "agent",
      database,
    ),
  ).toThrow("preserve their order");
  updateDayPlan(
    {
      ...day,
      requestId: "agent-after",
      expectedRevision: 2,
      reason: "Later candidate",
      changes: [change("b", false, 1)],
    },
    "agent",
    database,
  );
  expect(getDayPlan(day, database).selections.map((entry) => entry.activityId)).toEqual(["a", "b"]);
});

it("creates a Home task in its recommended section without a separate day selection", async () => {
  const { createUserActivity, getAllActivities } = await import("../activities/repository.server");
  const input = {
    requestId: "home-create",
    expectedRevision: 1,
    id: "home",
    title: "Read",
    nextAction: "Read",
    section: "focus",
  };
  const receipt = createUserActivity(input, database);
  expect(createUserActivity(input, database)).toEqual(receipt);
  expect(getAllActivities(database).activities).toContainEqual(
    expect.objectContaining({
      id: "home",
      origin: "user",
      effective: expect.objectContaining({ section: "focus" }),
    }),
  );
  expect(getDayPlan(day, database).selections).toEqual([]);
});
