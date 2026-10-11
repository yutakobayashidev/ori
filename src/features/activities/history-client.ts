import type { ActivityFailure } from "./model";
import type { ActivityAuditPage } from "./audit-model";
import type { CommunicationLogPage } from "./communication-model";

export type HistoryInput = { activityId?: string; beforeId?: number; limit?: number };
export type ActivityHistoryTransport = {
  changes: (input: HistoryInput) => Promise<ActivityAuditPage | ActivityFailure>;
  communications: (input: HistoryInput) => Promise<CommunicationLogPage | ActivityFailure>;
};
