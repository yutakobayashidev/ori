import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import type { ActivityReceipt } from "../activities/model";
import { enqueueActivityEvent } from "../mcp-events/events.server";
import type { AppDatabase } from "../storage/database.server";
import { type activities, activityTime, focusSessions, workLogs } from "../storage/schema";
import type { ActivityTime } from "./model";
import { projectedRemainingSeconds, sessionActiveSeconds } from "./time";
export function currentFocus(database: AppDatabase) {
  return (
    database.select().from(focusSessions).where(ne(focusSessions.state, "ended")).get() ?? null
  );
}
export function ensureActivityTime(activityId: string, database: AppDatabase) {
  database.insert(activityTime).values({ activityId }).onConflictDoNothing().run();
}
export function readActivityTime(
  row: typeof activities.$inferSelect,
  database: AppDatabase,
  now: number,
): ActivityTime {
  const record = database
    .select()
    .from(activityTime)
    .where(eq(activityTime.activityId, row.id))
    .get();
  const logs = database.select().from(workLogs).where(eq(workLogs.activityId, row.id)).all();
  const actualSeconds = logs.length ? logs.reduce((n, l) => n + l.durationSeconds, 0) : null;
  const session = database
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.activityId, row.id), ne(focusSessions.state, "ended")))
    .get();
  const activeSeconds = (actualSeconds ?? 0) + (session ? sessionActiveSeconds(session, now) : 0);
  const estimatedMinutes =
    row.userOverrides.estimatedMinutes ?? row.proposal.timeEstimate?.estimatedMinutes ?? null;
  const remainingEstimate = record?.remainingOverride ?? record?.remainingEstimate ?? null;
  const estimateUpdatedAt =
    row.userOverrides.estimatedMinutes !== undefined
      ? record?.userEstimateUpdatedAt
      : record?.estimateUpdatedAt;
  return {
    estimatedMinutes,
    estimateOrigin:
      row.userOverrides.estimatedMinutes !== undefined
        ? "user"
        : row.proposal.timeEstimate
          ? "agent"
          : null,
    estimateReason:
      row.userOverrides.estimatedMinutes !== undefined
        ? null
        : (row.proposal.timeEstimate?.reason ?? null),
    estimateUpdatedAt: estimateUpdatedAt ? new Date(estimateUpdatedAt).toISOString() : null,
    remainingEstimate,
    remainingOrigin: record?.remainingOverride
      ? "user"
      : record?.remainingEstimate
        ? "agent"
        : null,
    actualSeconds,
    activeSeconds,
    initialEstimatedMinutes: record?.initialEstimatedMinutes ?? null,
    projectedRemainingSeconds: projectedRemainingSeconds(
      remainingEstimate?.minutes ?? estimatedMinutes,
      activeSeconds,
      remainingEstimate?.activeSecondsAtEstimate ?? 0,
    ),
  };
}
export function captureInitial(row: typeof activities.$inferSelect, database: AppDatabase) {
  ensureActivityTime(row.id, database);
  database
    .update(activityTime)
    .set({
      initialCaptured: true,
      initialEstimatedMinutes:
        row.userOverrides.estimatedMinutes ?? row.proposal.timeEstimate?.estimatedMinutes ?? null,
    })
    .where(and(eq(activityTime.activityId, row.id), eq(activityTime.initialCaptured, false)))
    .run();
}
export function setRemaining(
  row: typeof activities.$inferSelect,
  minutes: number,
  reason: string | undefined,
  origin: "user" | "agent",
  database: AppDatabase,
  now: number,
) {
  const activeSeconds = readActivityTime(row, database, now).activeSeconds;
  ensureActivityTime(row.id, database);
  const contributions: Record<string, number> = Object.fromEntries(
    database
      .select()
      .from(workLogs)
      .where(eq(workLogs.activityId, row.id))
      .all()
      .map((log) => [log.focusSessionId ?? log.id, log.durationSeconds]),
  );
  const session = currentFocus(database);
  if (session?.activityId === row.id)
    contributions[session.id] = sessionActiveSeconds(session, now);
  const estimate = {
    minutes,
    reason,
    updatedAt: new Date(now).toISOString(),
    activeSecondsAtEstimate: activeSeconds,
    contributions,
  };
  database
    .update(activityTime)
    .set(origin === "user" ? { remainingOverride: estimate } : { remainingEstimate: estimate })
    .where(eq(activityTime.activityId, row.id))
    .run();
}
export function endActivityFocus(activityId: string, database: AppDatabase, now: number): boolean {
  const session = database
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.activityId, activityId), ne(focusSessions.state, "ended")))
    .get();
  if (!session) return false;
  const elapsedActiveSeconds = sessionActiveSeconds(session, now);
  database
    .update(focusSessions)
    .set({ state: "ended", runningSince: null, elapsedActiveSeconds, endedAt: now })
    .where(eq(focusSessions.id, session.id))
    .run();
  database
    .insert(workLogs)
    .values({
      id: randomUUID(),
      activityId,
      focusSessionId: session.id,
      durationSeconds: elapsedActiveSeconds,
      source: "timer",
      occurredOn: new Intl.DateTimeFormat("en-CA", {
        timeZone: session.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(session.startedAt),
      startedAt: session.startedAt,
      endedAt: now,
      createdAt: now,
    })
    .onConflictDoNothing()
    .run();
  return true;
}
export function emitTimeChange(
  activityId: string,
  origin: "user" | "agent",
  receipt: ActivityReceipt,
  changedFields: string[],
  database: AppDatabase,
  now: number,
) {
  enqueueActivityEvent(
    "activity.time_changed",
    {
      activityId,
      origin,
      requestId: receipt.requestId,
      revision: receipt.revision,
      occurredAt: receipt.receivedAt,
      changedFields,
    },
    database,
    now,
  );
}
