import { AsyncLocalStorage } from "node:async_hooks";
import { and, asc, desc, eq, inArray, lt, ne } from "drizzle-orm";
import { getDatabase, type AppDatabase } from "../storage/database.server";
import {
  activities,
  activityAudit,
  activityTime,
  focusSessions,
  workLogs,
} from "../storage/schema";
import {
  getActivityAuditInput,
  type ActivityAuditContext,
  type ActivityAuditPage,
  type ActivityAuditSnapshot,
} from "./audit-model";
import type { ActivityReceipt } from "./model";

const context = new AsyncLocalStorage<ActivityAuditContext>();
export function withActivityAuditContext<T>(value: ActivityAuditContext, operation: () => T): T {
  return context.run(value, operation);
}

/** Include focus/work-log targets resolved inside mutations and the task a focus switch ends. */
export function auditActivityIds(
  operation: string,
  input: object,
  ids: string[],
  database: AppDatabase,
): string[] {
  const targets = new Set(ids);
  if (operation === "start-focus") {
    const previous = database
      .select()
      .from(focusSessions)
      .where(ne(focusSessions.state, "ended"))
      .get();
    if (previous) targets.add(previous.activityId);
  }
  if (operation === "change-focus" && "sessionId" in input && typeof input.sessionId === "string") {
    const session = database
      .select()
      .from(focusSessions)
      .where(eq(focusSessions.id, input.sessionId))
      .get();
    if (session) targets.add(session.activityId);
  }
  if (operation === "delete-work-log" && "id" in input && typeof input.id === "string") {
    const log = database.select().from(workLogs).where(eq(workLogs.id, input.id)).get();
    if (log) targets.add(log.activityId);
  }
  return [...targets];
}
export function activityAuditSnapshots(
  ids: string[],
  database: AppDatabase,
): Map<string, ActivityAuditSnapshot> {
  if (!ids.length) return new Map();
  return new Map(
    database
      .select()
      .from(activities)
      .where(inArray(activities.id, ids))
      .all()
      .map((row) => [
        row.id,
        {
          number: row.number,
          proposal: row.proposal,
          userState: row.userState,
          userOverrides: row.userOverrides,
          assessment: row.assessment,
          time:
            database.select().from(activityTime).where(eq(activityTime.activityId, row.id)).get() ??
            null,
          focusSessions: database
            .select()
            .from(focusSessions)
            .where(eq(focusSessions.activityId, row.id))
            .orderBy(asc(focusSessions.id))
            .all(),
          workLogs: database
            .select()
            .from(workLogs)
            .where(eq(workLogs.activityId, row.id))
            .orderBy(asc(workLogs.id))
            .all(),
        },
      ]),
  );
}
export function recordActivityAudit(
  operation: string,
  receipt: ActivityReceipt,
  before: Map<string, ActivityAuditSnapshot>,
  after: Map<string, ActivityAuditSnapshot>,
  database: AppDatabase,
  now: number,
) {
  const attribution = context.getStore() ?? {
    actor: ["publish", "progress", "agent-decision"].includes(operation)
      ? ("agent" as const)
      : ("user" as const),
    channel: "internal" as const,
  };
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(id) ?? null;
    const next = after.get(id) ?? null;
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    database
      .insert(activityAudit)
      .values({
        activityId: id,
        operation,
        ...attribution,
        requestId: receipt.requestId,
        revision: receipt.revision,
        occurredAt: now,
        before: previous,
        after: next,
      })
      .run();
  }
}
export function getActivityAudit(input: unknown = {}, database = getDatabase()): ActivityAuditPage {
  const parsed = getActivityAuditInput.parse(input);
  const rows = database
    .select()
    .from(activityAudit)
    .where(
      and(
        parsed.activityId ? eq(activityAudit.activityId, parsed.activityId) : undefined,
        parsed.beforeId ? lt(activityAudit.id, parsed.beforeId) : undefined,
      ),
    )
    .orderBy(desc(activityAudit.id))
    .limit(parsed.limit + 1)
    .all();
  const entries = rows.slice(0, parsed.limit);
  return {
    ok: true,
    entries,
    nextBeforeId: rows.length > parsed.limit ? (entries.at(-1)?.id ?? null) : null,
  };
}
