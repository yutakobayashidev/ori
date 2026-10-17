import { expect, it } from "vitest";
import { codexUsageSchema, windowLabel } from "./model";

it.each([
  [300, "5h"],
  [10080, "Weekly"],
  [1440, "1d"],
  [30, "30m"],
])("labels the reported duration %i instead of assuming a fixed window", (minutes, label) => {
  expect(windowLabel(minutes)).toBe(label);
});

it.each([
  { usedPercent: -1 },
  { usedPercent: NaN },
  { usedPercent: "32" },
  { windowDurationMins: 0 },
  { resetsAt: "not a date" },
])("rejects malformed runtime usage: %j", (override) => {
  expect(
    codexUsageSchema.safeParse({
      status: "ready",
      fetchedAt: "2026-10-18T01:00:00Z",
      windows: [
        { id: "primary", usedPercent: 32, windowDurationMins: 300, resetsAt: null, ...override },
      ],
    }).success,
  ).toBe(false);
});
