import { describe, expect, it } from "vitest";
import type { RoutineDraft } from "./routine-model";
import { isRoutineDay, routineDay, scheduleLabel } from "./routine-schedule";
const schedule: RoutineDraft["schedule"] = {
  weekdays: [1],
  timeOfDay: "bedtime",
  time: null,
  timeZone: "Asia/Tokyo",
};
describe("routine schedules", () => {
  it("uses the routine timezone for both date and weekday across midnight", () => {
    const instant = new Date("2026-10-18T15:01:00Z");
    expect(routineDay(instant, "Asia/Tokyo")).toBe("2026-10-19");
    expect(isRoutineDay(schedule, instant)).toBe(true);
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
