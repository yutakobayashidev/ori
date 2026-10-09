import { z } from "zod";

const dayPlanDate = z.iso.date();
const dayPlanTimeZone = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Use an IANA time zone.");
export const getDayPlanInput = z.strictObject({ date: dayPlanDate, timeZone: dayPlanTimeZone });
const daySelectionChange = z.strictObject({
  activityId: z.string().min(1).max(128),
  section: z.enum(["focus", "optional"]),
  rank: z.number().int().nonnegative(),
  excluded: z.boolean().default(false),
});
export const updateDayPlanInput = z
  .strictObject({
    ...getDayPlanInput.shape,
    requestId: z.string().min(1).max(128),
    expectedRevision: z.number().int().nonnegative(),
    reason: z.string().trim().min(1).max(2000),
    changes: z.array(daySelectionChange).min(1).max(100),
  })
  .refine(
    (value) =>
      new Set(value.changes.map((change) => change.activityId)).size === value.changes.length,
    "Specify each activity only once.",
  );
export type DaySelectionChange = z.infer<typeof daySelectionChange>;
export type DaySelection = DaySelectionChange & {
  date: string;
  timeZone: string;
  origin: "user" | "agent";
  reason: string | null;
  userAdjustedAt: number | null;
  updatedAt: number;
};
export type DayPlan = {
  ok: true;
  revision: number;
  date: string;
  timeZone: string;
  selections: DaySelection[];
};
export function localDay(
  now = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return { date: `${part("year")}-${part("month")}-${part("day")}`, timeZone };
}
