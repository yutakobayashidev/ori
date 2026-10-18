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
  const day = new Date(`${routineDateForSchedule(schedule, now)}T00:00:00Z`).getUTCDay();
  return schedule.weekdays.includes(day);
}

function localHour(date: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date),
  );
}

export function routineDateForSchedule(
  schedule: RoutineDraft["schedules"][number],
  date: Date,
): string {
  const day = routineDay(date, schedule.timeZone);
  if (
    (schedule.timeOfDay === "evening" || schedule.timeOfDay === "bedtime") &&
    localHour(date, schedule.timeZone) < 4
  ) {
    const previous = new Date(`${day}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    return previous.toISOString().slice(0, 10);
  }
  return day;
}

export function inferRoutineSchedule(
  schedules: RoutineDraft["schedules"],
  now: Date,
): string | null {
  const eligible = schedules.filter((schedule) => isRoutineDay(schedule, now));
  const overnight = eligible.filter(
    (schedule) =>
      (schedule.timeOfDay === "evening" || schedule.timeOfDay === "bedtime") &&
      localHour(now, schedule.timeZone) < 4,
  );
  const candidates = overnight.length ? overnight : eligible;
  const targets = { morning: 8, afternoon: 14, evening: 18, bedtime: 22 };
  let nearest: { id: string; distance: number } | undefined;
  for (const schedule of candidates) {
    if (schedule.timeOfDay === "anytime" && !schedule.time) continue;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: schedule.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const minutes =
      Number(parts.find((part) => part.type === "hour")?.value) * 60 +
      Number(parts.find((part) => part.type === "minute")?.value);
    const [hour = 0, minute = 0] = schedule.time?.split(":").map(Number) ?? [
      targets[schedule.timeOfDay as keyof typeof targets],
      0,
    ];
    const delta = Math.abs(minutes - (hour * 60 + minute));
    const distance = Math.min(delta, 1440 - delta);
    if (!nearest || distance < nearest.distance) nearest = { id: schedule.id, distance };
  }
  return nearest?.id ?? candidates[0]?.id ?? null;
}

export function isScheduleRecorded(
  routineId: string,
  schedule: RoutineDraft["schedules"][number],
  runs: RoutineRun[],
  now: Date,
): boolean {
  return getScheduleRuns(routineId, schedule, runs, now).length > 0;
}

export function getScheduleRuns(
  routineId: string,
  schedule: RoutineDraft["schedules"][number],
  runs: RoutineRun[],
  now: Date,
): RoutineRun[] {
  const today = routineDateForSchedule(schedule, now);
  return runs.filter(
    (run) =>
      run.routineId === routineId &&
      run.scheduleId === schedule.id &&
      (run.routineDate ?? routineDateForSchedule(schedule, new Date(run.occurredAt))) === today,
  );
}
