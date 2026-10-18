import { expect, it } from "vitest";
import { dateShortcuts } from "./due-date-picker";

it("keeps This week on the current Sunday and leaves Anytime unset", () => {
  expect(dateShortcuts(new Date(2026, 9, 18, 23, 30))).toEqual([
    { label: "Today", value: "2026-10-18" },
    { label: "Tomorrow", value: "2026-10-19" },
    { label: "This week", value: "2026-10-18" },
    { label: "Anytime", value: null },
  ]);
});

it.each([
  [new Date(2026, 11, 31, 23, 30), "2026-12-31", "2027-01-01", "2027-01-03"],
  [new Date(2028, 1, 29, 0, 30), "2028-02-29", "2028-03-01", "2028-03-05"],
  [new Date(2026, 2, 7, 23, 30), "2026-03-07", "2026-03-08", "2026-03-08"],
  [new Date(2026, 2, 8, 0, 30), "2026-03-08", "2026-03-09", "2026-03-08"],
  [new Date(2026, 9, 31, 23, 30), "2026-10-31", "2026-11-01", "2026-11-01"],
  [new Date(2026, 10, 1, 0, 30), "2026-11-01", "2026-11-02", "2026-11-01"],
])(
  "uses local calendar days across month, year and DST changes: %s",
  (now, today, tomorrow, sunday) => {
    expect(dateShortcuts(now).map(({ value }) => value)).toEqual([today, tomorrow, sunday, null]);
  },
);
