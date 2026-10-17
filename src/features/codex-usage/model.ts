import { z } from "zod";

export const codexUsageSchema = z.object({
  status: z.enum(["ready", "unavailable"]),
  fetchedAt: z.iso.datetime().nullable(),
  windows: z.array(
    z.object({
      id: z.string(),
      usedPercent: z.number().min(0),
      windowDurationMins: z.number().int().positive(),
      resetsAt: z.iso.datetime().nullable(),
    }),
  ),
});

export type CodexUsage = z.infer<typeof codexUsageSchema>;

export function windowLabel(minutes: number) {
  if (minutes === 10080) return "Weekly";
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}
