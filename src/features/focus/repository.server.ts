import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import {
  ActivityPersistenceError,
  activityRevisionNumber,
  enqueueEvent,
  writeActivity,
} from "../activities/repository.server";
import { getDatabase, type AppDatabase } from "../storage/database.server";
import { activities, activityTime, focusSessions, workLogs } from "../storage/schema";
import {
  changeFocusInput,
  deleteWorkLogInput,
  loadFocusInput,
  saveWorkLogInput,
  startFocusInput,
  type FocusContext,
} from "./model";
import {
  captureInitial,
  currentFocus,
  emitTimeChange,
  endActivityFocus,
  readActivityTime,
} from "./storage.server";
import { defaultFocusBudget, sessionActiveSeconds } from "./time";
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ActivityPersistenceError("invalid-input", "Check the focus or work log fields.");
  return result.data;
}
function getActivity(id: string, database: AppDatabase) {
  const row = database.select().from(activities).where(eq(activities.id, id)).get();
  if (!row) throw new ActivityPersistenceError("invalid-input", "Activity not found.");
  return row;
}
function conflict(message: string): never {
  throw new ActivityPersistenceError("state-conflict", message);
}
export function getFocusContext(input: unknown = {}, database = getDatabase()): FocusContext {
  const parsed = parse(loadFocusInput, input);
  return database.transaction(() => ({
    ok: true,
    revision: activityRevisionNumber(database),
    serverNow: Date.now(),
    session: currentFocus(database),
    workLogs: parsed.activityId
      ? database.select().from(workLogs).where(eq(workLogs.activityId, parsed.activityId)).all()
      : [],
  }));
}
export function startFocus(input: unknown, database = getDatabase()) {
  const parsed = parse(startFocusInput, input);
  return writeActivity(
    "start-focus",
    parsed,
    [parsed.activityId],
    (receipt, now) => {
      const row = getActivity(parsed.activityId, database);
      if (!["available", "inProgress"].includes(row.userState))
        conflict("Review this activity's state before starting focus.");
      const previous = currentFocus(database);
      if (previous && !parsed.switchCurrent)
        conflict("Another focus session is unfinished. End it before starting.");
      if (previous) {
        endActivityFocus(previous.activityId, database, now);
        emitTimeChange(previous.activityId, "user", receipt, ["actualSeconds"], database, now);
      }
      captureInitial(row, database);
      const budgetSeconds =
        parsed.budgetSeconds ??
        defaultFocusBudget(readActivityTime(row, database, now).projectedRemainingSeconds);
      database
        .insert(focusSessions)
        .values({
          id: randomUUID(),
          activityId: row.id,
          budgetSeconds,
          state: "running",
          startedAt: now,
          timeZone: parsed.timeZone,
          runningSince: now,
          elapsedActiveSeconds: 0,
        })
        .run();
      if (row.userState === "available") {
        database
          .update(activities)
          .set({ userState: "inProgress", updatedAt: now, assessment: null })
          .where(eq(activities.id, row.id))
          .run();
        enqueueEvent(
          "activity.status_changed",
          { ...row, userState: "inProgress" },
          "user",
          receipt,
          database,
          now,
          row.userState,
        );
      }
    },
    database,
  );
}
export function changeFocus(input: unknown, database = getDatabase()) {
  const parsed = parse(changeFocusInput, input);
  return writeActivity(
    "change-focus",
    parsed,
    [],
    (receipt, now) => {
      const session = database
        .select()
        .from(focusSessions)
        .where(eq(focusSessions.id, parsed.sessionId))
        .get();
      if (!session || session.state === "ended")
        conflict("This focus session has ended. Reload the latest state.");
      const row = getActivity(session.activityId, database);
      receipt.activityIds = [row.id];
      if (parsed.action === "pause") {
        if (session.state !== "running") conflict("The session is already paused.");
        database
          .update(focusSessions)
          .set({
            state: "paused",
            elapsedActiveSeconds: sessionActiveSeconds(session, now),
            runningSince: null,
          })
          .where(eq(focusSessions.id, session.id))
          .run();
      }
      if (parsed.action === "resume") {
        if (session.state !== "paused" || !["available", "inProgress"].includes(row.userState))
          conflict("This session cannot resume.");
        database
          .update(focusSessions)
          .set({ state: "running", runningSince: now })
          .where(eq(focusSessions.id, session.id))
          .run();
      }
      if (parsed.action === "extend")
        database
          .update(focusSessions)
          .set({ budgetSeconds: session.budgetSeconds + (parsed.additionalSeconds ?? 300) })
          .where(eq(focusSessions.id, session.id))
          .run();
      if (parsed.action === "end" || parsed.action === "complete") {
        endActivityFocus(row.id, database, now);
        emitTimeChange(row.id, "user", receipt, ["actualSeconds"], database, now);
      }
      if (parsed.action === "complete") {
        database
          .update(activities)
          .set({ userState: "completed", completedAt: now, assessment: null, updatedAt: now })
          .where(eq(activities.id, row.id))
          .run();
        enqueueEvent(
          "activity.status_changed",
          { ...row, userState: "completed", completedAt: now },
          "user",
          receipt,
          database,
          now,
          row.userState,
        );
      }
    },
    database,
  );
}
function adjustBaselines(
  log: typeof workLogs.$inferSelect,
  nextDuration: number,
  database: AppDatabase,
) {
  const record = database
    .select()
    .from(activityTime)
    .where(eq(activityTime.activityId, log.activityId))
    .get();
  if (!record) return;
  const key = log.focusSessionId ?? log.id;
  const adjust = (value: typeof record.remainingEstimate) => {
    if (!value) return value;
    const before = value.contributions?.[key] ?? 0;
    // A correction to a whole log is distributed proportionally over its recorded work.
    const ratio =
      value.contributionRatios?.[key] ??
      (log.durationSeconds > 0
        ? before / log.durationSeconds
        : Object.hasOwn(value.contributions ?? {}, key)
          ? 1
          : 0);
    const after = ratio * nextDuration;
    return {
      ...value,
      activeSecondsAtEstimate: value.activeSecondsAtEstimate + after - before,
      contributions: { ...value.contributions, [key]: after },
      contributionRatios: { ...value.contributionRatios, [key]: ratio },
    };
  };
  database
    .update(activityTime)
    .set({
      remainingEstimate: adjust(record.remainingEstimate),
      remainingOverride: adjust(record.remainingOverride),
    })
    .where(eq(activityTime.activityId, log.activityId))
    .run();
}
export function saveWorkLog(input: unknown, database = getDatabase()) {
  const parsed = parse(saveWorkLogInput, input);
  return writeActivity(
    "save-work-log",
    parsed,
    [parsed.activityId],
    (receipt, now) => {
      const row = getActivity(parsed.activityId, database);
      const existing = database.select().from(workLogs).where(eq(workLogs.id, parsed.id)).get();
      if (existing && existing.activityId !== parsed.activityId)
        throw new ActivityPersistenceError(
          "immutable-field",
          "A log cannot move to a different activity.",
        );
      captureInitial(row, database);
      if (existing) {
        adjustBaselines(existing, parsed.durationSeconds, database);
        database
          .update(workLogs)
          .set({
            durationSeconds: parsed.durationSeconds,
            occurredOn: parsed.occurredOn,
            note: parsed.note ?? null,
          })
          .where(eq(workLogs.id, parsed.id))
          .run();
      } else
        database
          .insert(workLogs)
          .values({
            id: parsed.id,
            activityId: row.id,
            durationSeconds: parsed.durationSeconds,
            occurredOn: parsed.occurredOn,
            note: parsed.note,
            source: "manual",
            createdAt: now,
          })
          .run();
      emitTimeChange(row.id, "user", receipt, ["actualSeconds"], database, now);
    },
    database,
  );
}
export function deleteWorkLog(input: unknown, database = getDatabase()) {
  const parsed = parse(deleteWorkLogInput, input);
  return writeActivity(
    "delete-work-log",
    parsed,
    [],
    (receipt, now) => {
      const existing = database.select().from(workLogs).where(eq(workLogs.id, parsed.id)).get();
      if (!existing) throw new ActivityPersistenceError("invalid-input", "Work log not found.");
      receipt.activityIds = [existing.activityId];
      adjustBaselines(existing, 0, database);
      database.delete(workLogs).where(eq(workLogs.id, existing.id)).run();
      emitTimeChange(existing.activityId, "user", receipt, ["actualSeconds"], database, now);
    },
    database,
  );
}
