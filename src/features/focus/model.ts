import { z } from "zod";
export type RemainingEstimate = {
  minutes: number;
  reason?: string;
  updatedAt: string;
  activeSecondsAtEstimate: number;
  contributions?: Record<string, number>;
  contributionRatios?: Record<string, number>;
};
export type ActivityTime = {
  estimatedMinutes: number | null;
  estimateOrigin: "user" | "agent" | null;
  estimateReason: string | null;
  estimateUpdatedAt: string | null;
  remainingEstimate: RemainingEstimate | null;
  remainingOrigin: "user" | "agent" | null;
  actualSeconds: number | null;
  activeSeconds: number;
  initialEstimatedMinutes: number | null;
  projectedRemainingSeconds: number | null;
};
export type FocusSession = {
  id: string;
  activityId: string;
  budgetSeconds: number;
  timeZone: string;
  state: "running" | "paused" | "ended";
  startedAt: number;
  runningSince: number | null;
  elapsedActiveSeconds: number;
  endedAt: number | null;
};
export type WorkLog = {
  id: string;
  activityId: string;
  durationSeconds: number;
  occurredOn: string;
  source: "manual" | "timer";
  focusSessionId: string | null;
  startedAt: number | null;
  endedAt: number | null;
  note: string | null;
  createdAt: number;
};
const identity = z.string().min(1).max(128);
const write = { requestId: identity, expectedRevision: z.number().int().nonnegative() };
export const loadFocusInput = z.strictObject({ activityId: identity.optional() });
export const startFocusInput = z.strictObject({
  ...write,
  activityId: identity,
  budgetSeconds: z.number().int().min(60).max(86400).optional(),
  switchCurrent: z.boolean().optional(),
  timeZone: z
    .string()
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Use a valid IANA time zone.")
    .default("UTC"),
});
export const changeFocusInput = z.strictObject({
  ...write,
  sessionId: identity,
  action: z.enum(["pause", "resume", "extend", "end", "complete"]),
  additionalSeconds: z.number().int().min(60).max(86400).optional(),
});
export const saveWorkLogInput = z.strictObject({
  ...write,
  id: identity,
  activityId: identity,
  durationSeconds: z.number().int().nonnegative().max(604800),
  occurredOn: z.iso.date(),
  note: z.string().max(2000).optional(),
});
export const deleteWorkLogInput = z.strictObject({ ...write, id: identity });
export type FocusContext = {
  ok: true;
  revision: number;
  serverNow: number;
  session: FocusSession | null;
  workLogs: WorkLog[];
};
