import { z } from "zod";
import type {
  ActivityAssessment,
  ActivityOverrides,
  ActivityProposal,
  ActivityState,
} from "./model";
import type { activityTime, focusSessions, workLogs } from "../storage/schema";

export const getActivityAuditInput = z.strictObject({
  activityId: z.string().min(1).max(128).optional(),
  beforeId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type ActivityAuditContext = {
  actor: "user" | "agent" | "system";
  channel: "browser" | "mcp" | "execution" | "internal";
};
export type ActivityAuditSnapshot = {
  number: number;
  proposal: ActivityProposal;
  userState: ActivityState;
  completedAt?: number | null;
  userOverrides: ActivityOverrides;
  assessment: ActivityAssessment | null;
  time: typeof activityTime.$inferSelect | null;
  focusSessions: (typeof focusSessions.$inferSelect)[];
  workLogs: (typeof workLogs.$inferSelect)[];
};
export type ActivityAuditEntry = ActivityAuditContext & {
  id: number;
  activityId: string;
  operation: string;
  requestId: string;
  revision: number;
  occurredAt: number;
  before: ActivityAuditSnapshot | null;
  after: ActivityAuditSnapshot | null;
};
export type ActivityAuditPage = {
  ok: true;
  entries: ActivityAuditEntry[];
  nextBeforeId: number | null;
};
