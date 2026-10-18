import { describe, expect, it } from "vitest";
import type { RoutineDraft } from "./routine-model";
import {
  inferRoutineSchedule,
  isRoutineDay,
  isScheduleRecorded,
  routineDay,
  routineDateForSchedule,
  scheduleLabel,
} from "./routine-schedule";
const schedule: RoutineDraft["schedules"][number] = {
  id: "bedtime",
  weekdays: [1],
  timeOfDay: "bedtime",
  time: null,
  timeZone: "Asia/Tokyo",
};
describe("routine schedules", () => {
  it("uses the routine timezone for both date and weekday across midnight", () => {
    const instant = new Date("2026-10-18T15:01:00Z");
    expect(routineDay(instant, "Asia/Tokyo")).toBe("2026-10-19");
    expect(isRoutineDay(schedule, instant)).toBe(false);
    expect(isRoutineDay({ ...schedule, weekdays: [0] }, instant)).toBe(true);
    expect(routineDay(instant, "America/Los_Angeles")).toBe("2026-10-18");
    expect(isRoutineDay({ ...schedule, timeZone: "America/Los_Angeles" }, instant)).toBe(false);
  });
  it("groups multiple measurements on the same local day, including DST repeated hours", () => {
    expect(routineDay(new Date("2026-11-01T05:30:00Z"), "America/New_York")).toBe("2026-11-01");
    expect(routineDay(new Date("2026-11-01T06:30:00Z"), "America/New_York")).toBe("2026-11-01");
    expect(routineDay(new Date("2026-10-18T15:00:00Z"), "Asia/Tokyo")).toBe(
      routineDay(new Date("2026-10-19T14:59:59Z"), "Asia/Tokyo"),
    );
  });
  it("shows flexible time without inventing an hour and preserves explicit times", () => {
    expect(scheduleLabel(schedule)).toBe("Mon · Bedtime");
    expect(scheduleLabel({ ...schedule, weekdays: [0, 1, 2, 3, 4, 5, 6], time: "21:30" })).toBe(
      "Every day · 21:30",
    );
    expect(scheduleLabel({ ...schedule, weekdays: [0, 6], timeOfDay: "anytime" })).toBe(
      "Sun, Sat · Anytime",
    );
  });
});

it("keeps night records on the previous date until 04:00 without moving morning", () => {
  const night = { ...schedule, weekdays: [0, 1, 2, 3, 4, 5, 6] };
  const morning = { ...night, id: "morning", timeOfDay: "morning" as const };
  for (const instant of ["2026-10-18T15:00:00Z", "2026-10-18T18:59:59Z"]) {
    expect(routineDateForSchedule(night, new Date(instant))).toBe("2026-10-18");
    expect(routineDateForSchedule(morning, new Date(instant))).toBe("2026-10-19");
    expect(inferRoutineSchedule([morning, night], new Date(instant))).toBe("bedtime");
  }
  expect(routineDateForSchedule(night, new Date("2026-10-18T19:00:00Z"))).toBe("2026-10-19");
});

it("uses calendar subtraction across DST and year boundaries", () => {
  expect(routineDateForSchedule(schedule, new Date("2026-12-31T16:00:00Z"))).toBe("2026-12-31");
  const ny = { ...schedule, timeZone: "America/New_York" };
  expect(routineDateForSchedule(ny, new Date("2026-11-01T05:30:00Z"))).toBe("2026-10-31");
  expect(routineDateForSchedule(ny, new Date("2026-11-01T06:30:00Z"))).toBe("2026-10-31");
  expect(routineDateForSchedule(ny, new Date("2026-03-08T07:30:00Z"))).toBe("2026-03-07");
});

it("honors an explicit routine date and keeps yesterday's night completion until rollover", () => {
  const run = {
    id: "night-record",
    routineId: "bath",
    routineVersion: 1,
    scheduleId: "bedtime",
    occurredAt: "2026-10-18T16:00:00Z",
    recordedAt: "2026-10-18T16:00:00Z",
    steps: [],
  };
  expect(isScheduleRecorded("bath", schedule, [run], new Date("2026-10-18T18:59:59Z"))).toBe(true);
  expect(isScheduleRecorded("bath", schedule, [run], new Date("2026-10-18T19:00:00Z"))).toBe(false);
  expect(
    isScheduleRecorded(
      "bath",
      schedule,
      [{ ...run, routineDate: "2026-10-19" }],
      new Date("2026-10-18T19:00:00Z"),
    ),
  ).toBe(true);
});

it("tracks morning and night separately using each schedule's local recording day", () => {
  const morning = { ...schedule, id: "morning", timeOfDay: "morning" as const };
  const night = { ...schedule, id: "night" };
  const run = {
    id: "record",
    routineId: "blood-pressure",
    routineVersion: 1,
    scheduleId: "morning",
    occurredAt: "2026-10-18T23:12:00Z",
    recordedAt: "2026-10-19T16:00:00Z",
    steps: [],
  };
  const today = new Date("2026-10-19T12:00:00Z");
  expect(isScheduleRecorded("blood-pressure", morning, [run], today)).toBe(true);
  expect(isScheduleRecorded("blood-pressure", night, [run], today)).toBe(false);
  expect(isScheduleRecorded("weight", morning, [run], today)).toBe(false);
  expect(
    isScheduleRecorded("blood-pressure", morning, [run], new Date("2026-10-19T15:00:00Z")),
  ).toBe(false);
  expect(isScheduleRecorded("blood-pressure", morning, [{ ...run, scheduleId: null }], today)).toBe(
    false,
  );
});

it.each([
  ["2026-10-18T23:00:00Z", "morning"],
  ["2026-10-19T13:00:00Z", "bedtime"],
])("infers the local slot at %s", (instant, expected) => {
  expect(
    inferRoutineSchedule(
      [{ ...schedule, id: "morning", timeOfDay: "morning" }, schedule],
      new Date(instant),
    ),
  ).toBe(expected);
});
it("uses exact times before daypart hints and leaves unscheduled days unassigned", () => {
  const schedules = [
    { ...schedule, id: "early", time: "06:00", timeOfDay: "morning" as const },
    { ...schedule, id: "late", time: "11:00", timeOfDay: "morning" as const },
  ];
  expect(inferRoutineSchedule(schedules, new Date("2026-10-19T01:30:00Z"))).toBe("late");
  expect(inferRoutineSchedule(schedules, new Date("2026-10-20T01:30:00Z"))).toBeNull();
  expect(inferRoutineSchedule([], new Date("2026-10-19T01:30:00Z"))).toBeNull();
});
