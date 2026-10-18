import type { RoutineDraft, RoutineRun } from "./routine-model";
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function scheduleLabel(schedule: RoutineDraft["schedules"][number]): string {
  const days =
    schedule.weekdays.length === 7
      ? "Every day"
      : schedule.weekdays.map((day) => weekdays[day]).join(", ");
  const timing =
    schedule.time ??
    {
      morning: "Morning",
      afternoon: "Afternoon",
      evening: "Evening",
      bedtime: "Bedtime",
      anytime: "Anytime",
    }[schedule.timeOfDay];
  return `${days} · ${timing}`;
}
export function routineDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function isRoutineDay(schedule: RoutineDraft["schedules"][number], now: Date): boolean {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: schedule.timeZone,
    weekday: "short",
  }).format(now);
  return schedule.weekdays.includes(weekdays.indexOf(day));
}

export function isScheduleRecorded(
  routineId: string,
  schedule: RoutineDraft["schedules"][number],
  runs: RoutineRun[],
  now: Date,
): boolean {
  const today = routineDay(now, schedule.timeZone);
  return runs.some(
    (run) =>
      run.routineId === routineId &&
      run.scheduleId === schedule.id &&
      routineDay(new Date(run.occurredAt), schedule.timeZone) === today,
  );
}
