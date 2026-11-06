import type { ActivityFailure } from "./model";
import type { ActivityAuditPage } from "./audit-model";

export type HistoryInput = { activityId?: string; beforeId?: number; limit?: number };
export type ActivityHistoryTransport = {
  changes: (input: HistoryInput) => Promise<ActivityAuditPage | ActivityFailure>;
};
