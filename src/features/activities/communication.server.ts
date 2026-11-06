import { and, desc, lt, sql } from "drizzle-orm";
import { getDatabase } from "../storage/database.server";
import { communicationLogs } from "../storage/schema";
import { getCommunicationLogsInput, type CommunicationLogPage } from "./communication-model";

// Read-only access to communication history collected before OpenTelemetry.
export function getCommunicationLogs(
  input: unknown = {},
  database = getDatabase(),
): CommunicationLogPage {
  const parsed = getCommunicationLogsInput.parse(input);
  const rows = database
    .select()
    .from(communicationLogs)
    .where(
      and(
        parsed.beforeId ? lt(communicationLogs.id, parsed.beforeId) : undefined,
        parsed.activityId
          ? sql`exists (select 1 from json_each(${communicationLogs.activityIds}) where value = ${parsed.activityId})`
          : undefined,
      ),
    )
    .orderBy(desc(communicationLogs.id))
    .limit(parsed.limit + 1)
    .all();
  const entries = rows.slice(0, parsed.limit);
  return {
    ok: true,
    entries,
    nextBeforeId: rows.length > parsed.limit ? (entries.at(-1)?.id ?? null) : null,
  };
}
