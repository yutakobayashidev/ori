import { auditActivityIds, activityAuditSnapshots, recordActivityAudit } from "./audit.server";
import {
  currentFocus,
  readActivityTime,
  ensureActivityTime,
  endActivityFocus,
  setRemaining,
  emitTimeChange,
} from "../focus/storage.server";
import { activityTime } from "../storage/schema";
import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { beeperMessageText } from "../beeper/message-text.server";
import type { ActivityEventName } from "../mcp-events/activity-events";
import { enqueueActivityEvent } from "../mcp-events/events.server";
import { getDatabase, type AppDatabase } from "../storage/database.server";
import {
  activities,
  activityReceipts,
  activityRevision,
  activityNumberSequence,
} from "../storage/schema";
import { notifyActivities } from "./events.server";
import {
  createHomeActivityInput,
  updateActivityProgressInput,
  getActivityContextInput,
  publishActivitiesInput,
  updateActivityUserInput,
  type Activity,
  type ActivityContext,
  type ActivityErrorCode,
  type ActivityProposal,
  type ActivityReceipt,
  type ActivityState,
} from "./model";

export class ActivityPersistenceError extends Error {
  constructor(
    readonly code: ActivityErrorCode,
    message: string,
  ) {
    super(message);
  }
}
function fail(code: ActivityErrorCode, message: string): never {
  throw new ActivityPersistenceError(code, message);
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) fail("invalid-input", "Check the activity fields and source references.");
  return result.data;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
function checkSize(input: unknown) {
  if (Buffer.byteLength(JSON.stringify(input) ?? "", "utf8") > 256 * 1024)
    fail("payload-too-large", "Activity publication exceeds 256 KiB.");
}
export function activityRevisionNumber(database: AppDatabase) {
  return (
    database.select().from(activityRevision).where(eq(activityRevision.id, 1)).get()?.revision ?? 0
  );
}
function activity(
  row: typeof activities.$inferSelect,
  database: AppDatabase,
  now = Date.now(),
): Activity {
  const { userState, userOverrides } = row;
  const proposal = {
    ...row.proposal,
    sources: row.proposal.sources.map((source) =>
      source.kind === "message"
        ? { ...source, excerpt: beeperMessageText(source.excerpt) }
        : source,
    ),
  };
  const { draft, section } = userOverrides;
  const common = { ...userOverrides };
  delete common.draft;
  delete common.section;
  delete common.estimatedMinutes;
  delete common.remainingMinutes;
  const effective = {
    ...proposal,
    ...common,
    section: section ?? proposal.recommendation?.section ?? ("optional" as const),
  };
  if (effective.kind === "reply" && draft !== undefined)
    effective.reply = { ...effective.reply, draft };
  return {
    id: row.id,
    number: row.number,
    origin: row.origin,
    isUnread: row.origin === "agent" && row.readAt === null,
    proposal,
    userState,
    userOverrides,
    effective,
    assessment: row.assessment,
    time: readActivityTime(row, database, now),
  };
}
const cursorSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  filter: z.string(),
  after: z.string().min(1).max(128),
});
export function getActivityContext(input: unknown = {}, database = getDatabase()): ActivityContext {
  const parsed = parse(getActivityContextInput, input);
  const ids = parsed.activityIds ? [...new Set(parsed.activityIds)].sort() : undefined;
  const numbers = parsed.activityNumbers
    ? [...new Set(parsed.activityNumbers)].sort((a, b) => a - b)
    : undefined;
  const states = parsed.states ? [...new Set(parsed.states)].sort() : undefined;
  const filter = hash({
    activityIds: ids,
    activityNumbers: numbers,
    states,
    conversation: parsed.conversation,
    limit: parsed.limit,
  });
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (parsed.cursor) {
    try {
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(parsed.cursor, "base64url").toString("utf8")),
      );
    } catch {
      fail("invalid-input", "Invalid activity cursor.");
    }
    if (cursor.filter !== filter)
      fail("invalid-input", "Cursor does not match the requested filter.");
  }
  return database.transaction(() => {
    const current = activityRevisionNumber(database);
    if (cursor && cursor.revision !== current)
      fail("stale-cursor", "Activities changed. Restart from the first page.");
    const rows = database
      .select()
      .from(activities)
      .where(
        and(
          ids ? inArray(activities.id, ids) : undefined,
          numbers ? inArray(activities.number, numbers) : undefined,
          states ? inArray(activities.userState, states) : undefined,
          parsed.conversation
            ? sql`exists (select 1 from json_each(${activities.proposal}, '$.sources') as source where json_extract(source.value, '$.kind') = 'message' and json_extract(source.value, '$.targetId') = ${parsed.conversation.targetId} and json_extract(source.value, '$.accountId') = ${parsed.conversation.accountId} and json_extract(source.value, '$.chatId') = ${parsed.conversation.chatId})`
            : undefined,
          cursor ? gt(activities.id, cursor.after) : undefined,
        ),
      )
      .orderBy(asc(activities.id))
      .limit(parsed.limit + 1)
      .all();
    const page = rows.slice(0, parsed.limit);
    const existing = ids
      ? new Set(
          database
            .select({ id: activities.id })
            .from(activities)
            .where(inArray(activities.id, ids))
            .all()
            .map((row) => row.id),
        )
      : undefined;
    const existingNumbers = numbers
      ? new Set(
          database
            .select({ number: activities.number })
            .from(activities)
            .where(inArray(activities.number, numbers))
            .all()
            .map((row) => row.number),
        )
      : undefined;
    return {
      ok: true,
      revision: current,
      serverNow: Date.now(),
      focusSession: currentFocus(database),
      activities: page.map((row) => activity(row, database)),
      missingActivityIds: ids?.filter((id) => !existing?.has(id)) ?? [],
      missingActivityNumbers: numbers?.filter((number) => !existingNumbers?.has(number)) ?? [],
      nextCursor:
        rows.length > parsed.limit
          ? Buffer.from(
              JSON.stringify({ revision: current, filter, after: page.at(-1)?.id }),
            ).toString("base64url")
          : null,
    };
  });
}
export function getAllActivities(database = getDatabase()): ActivityContext {
  return database.transaction(() => ({
    ok: true,
    revision: activityRevisionNumber(database),
    serverNow: Date.now(),
    focusSession: currentFocus(database),
    activities: database
      .select()
      .from(activities)
      .orderBy(asc(activities.id))
      .all()
      .map((row) => activity(row, database)),
    missingActivityIds: [],
    missingActivityNumbers: [],
    nextCursor: null,
  }));
}

export function markActivityRead(id: string, database = getDatabase()) {
  const now = Date.now();
  const changed =
    database
      .update(activities)
      .set({ readAt: now })
      .where(
        and(
          eq(activities.id, id),
          eq(activities.origin, "agent"),
          sql`${activities.readAt} IS NULL`,
        ),
      )
      .run().changes > 0;
  if (changed) notifyActivities();
  return changed;
}
function anchor(proposal: ActivityProposal) {
  if (proposal.kind !== "reply") return undefined;
  const source = proposal.sources.find((candidate) => candidate.id === proposal.reply.sourceId);
  if (!source || source.kind !== "message") fail("invalid-input", "Reply source is missing.");
  return {
    provider: source.provider,
    targetId: source.targetId,
    accountId: source.accountId,
    chatId: source.chatId,
    messageId: source.messageId,
  };
}
export function enqueueEvent(
  name: ActivityEventName,
  row: typeof activities.$inferSelect,
  origin: "user" | "agent",
  receipt: ActivityReceipt,
  database: AppDatabase,
  now: number,
  previousState?: ActivityState,
) {
  const { effective } = activity(row, database, now);
  enqueueActivityEvent(
    name,
    {
      activityId: row.id,
      kind: effective.kind,
      title: effective.title,
      nextAction: effective.nextAction,
      state: row.userState,
      ...(previousState === undefined ? {} : { previousState }),
      origin,
      requestId: receipt.requestId,
      revision: receipt.revision,
      occurredAt: receipt.receivedAt,
    },
    database,
    now,
  );
}
export function writeActivity<T extends { requestId: string; expectedRevision: number }>(
  operation: string,
  input: T,
  ids: string[],
  mutate: (receipt: ActivityReceipt, now: number) => void,
  database: AppDatabase,
): ActivityReceipt {
  let changed = false;
  const result = database.transaction(
    () => {
      const inputHash = hash({ operation, input });
      const receipt = database
        .select()
        .from(activityReceipts)
        .where(eq(activityReceipts.requestId, input.requestId))
        .get();
      if (receipt) {
        if (receipt.inputHash !== inputHash)
          fail("idempotency-conflict", "This request ID was already used with different input.");
        return receipt.result;
      }
      const current = activityRevisionNumber(database);
      if (current !== input.expectedRevision)
        fail("revision-conflict", "Activities changed. Read the latest context before retrying.");
      const now = Date.now();
      const result: ActivityReceipt = {
        ok: true,
        requestId: input.requestId,
        revision: current + 1,
        activityIds: ids,
        receivedAt: new Date(now).toISOString(),
      };
      const auditIds = auditActivityIds(operation, input, ids, database);
      const before = activityAuditSnapshots(auditIds, database);
      mutate(result, now);
      const after = activityAuditSnapshots(
        [...new Set([...auditIds, ...result.activityIds])],
        database,
      );
      recordActivityAudit(operation, result, before, after, database, now);
      database
        .insert(activityRevision)
        .values({ id: 1, revision: result.revision })
        .onConflictDoUpdate({ target: activityRevision.id, set: { revision: result.revision } })
        .run();
      database
        .insert(activityReceipts)
        .values({ requestId: input.requestId, inputHash, result })
        .run();
      changed = true;
      return result;
    },
    { behavior: "immediate" },
  );
  if (changed) notifyActivities();
  return result;
}
function allocateActivityNumber(database: AppDatabase): number {
  const allocated = database
    .insert(activityNumberSequence)
    .values({ id: 1, lastNumber: 1 })
    .onConflictDoUpdate({
      target: activityNumberSequence.id,
      set: { lastNumber: sql`${activityNumberSequence.lastNumber} + 1` },
    })
    .returning({ number: activityNumberSequence.lastNumber })
    .get();
  if (!allocated) fail("internal-error", "Unable to allocate activity number.");
  return allocated.number;
}
export function publishActivities(input: unknown, database = getDatabase()): ActivityReceipt {
  checkSize(input);
  const parsed = parse(publishActivitiesInput, input);
  return writeActivity(
    "publish",
    parsed,
    parsed.activities.map((proposal) => proposal.id),
    (receipt, now) => {
      for (const proposal of parsed.activities) {
        const existing = database
          .select()
          .from(activities)
          .where(eq(activities.id, proposal.id))
          .get();
        if (
          existing &&
          (existing.proposal.kind !== proposal.kind ||
            canonical(anchor(existing.proposal)) !== canonical(anchor(proposal)))
        )
          fail(
            "immutable-field",
            "An existing activity cannot change kind or reply destination and message anchor.",
          );
        const number = existing?.number ?? allocateActivityNumber(database);
        database
          .insert(activities)
          .values({
            id: proposal.id,
            number,
            origin: existing?.origin ?? "agent",
            proposal,
            userState: "available",
            userOverrides: {},
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({ target: activities.id, set: { proposal, updatedAt: now } })
          .run();
        if (
          JSON.stringify(existing?.proposal.timeEstimate) !== JSON.stringify(proposal.timeEstimate)
        ) {
          ensureActivityTime(proposal.id, database);
          database
            .update(activityTime)
            .set({ estimateUpdatedAt: now })
            .where(eq(activityTime.activityId, proposal.id))
            .run();
          if (existing?.userOverrides.estimatedMinutes === undefined)
            emitTimeChange(proposal.id, "agent", receipt, ["estimatedMinutes"], database, now);
        }
        if (!existing)
          enqueueEvent(
            "activity.created",
            {
              id: proposal.id,
              number,
              origin: "agent",
              readAt: null,
              proposal,
              userState: "available",
              userOverrides: {},
              assessment: null,
              createdAt: now,
              updatedAt: now,
            },
            "agent",
            receipt,
            database,
            now,
          );
      }
    },
    database,
  );
}
export function updateActivityUser(
  input: unknown,
  database = getDatabase(),
  origin: "user" | "agent" = "user",
): ActivityReceipt {
  const parsed = parse(updateActivityUserInput, input);
  return writeActivity(
    origin === "user" ? "user" : "agent-decision",
    parsed,
    [parsed.id],
    (receipt, now) => {
      const existing = database.select().from(activities).where(eq(activities.id, parsed.id)).get();
      if (!existing) fail("invalid-input", "This activity does not exist.");
      if (
        existing.proposal.kind === "task" &&
        (parsed.overrides?.draft !== undefined || parsed.resetOverrides?.includes("draft"))
      )
        fail("invalid-input", "Only reply activities have drafts.");
      if (
        origin === "agent" &&
        (parsed.overrides?.estimatedMinutes !== undefined ||
          parsed.overrides?.remainingMinutes !== undefined ||
          parsed.resetOverrides?.some((k) => k === "estimatedMinutes" || k === "remainingMinutes"))
      )
        fail("invalid-input", "Time overrides are owner-only. Use contextual progress updates.");
      const userOverrides = { ...existing.userOverrides, ...parsed.overrides };
      for (const key of parsed.resetOverrides ?? []) delete userOverrides[key];
      const updated = {
        ...existing,
        userState: parsed.state ?? existing.userState,
        userOverrides,
        assessment:
          parsed.state && parsed.state !== existing.userState ? null : existing.assessment,
        updatedAt: now,
      };
      database
        .update(activities)
        .set({
          userState: updated.userState,
          userOverrides,
          assessment: updated.assessment,
          updatedAt: now,
        })
        .where(eq(activities.id, parsed.id))
        .run();
      const timeFields: string[] = [];
      if (
        !["available", "inProgress"].includes(updated.userState) &&
        endActivityFocus(parsed.id, database, now)
      )
        timeFields.push("actualSeconds");
      if (parsed.overrides?.remainingMinutes !== undefined) {
        setRemaining(existing, parsed.overrides.remainingMinutes, undefined, "user", database, now);
        timeFields.push("remainingMinutes");
      }
      if (
        parsed.resetOverrides?.includes("remainingMinutes") &&
        existing.userOverrides.remainingMinutes !== undefined
      ) {
        ensureActivityTime(parsed.id, database);
        database
          .update(activityTime)
          .set({ remainingOverride: null })
          .where(eq(activityTime.activityId, parsed.id))
          .run();
        timeFields.push("remainingMinutes");
      }
      if (
        (parsed.overrides?.estimatedMinutes !== undefined &&
          parsed.overrides.estimatedMinutes !== existing.userOverrides.estimatedMinutes) ||
        (parsed.resetOverrides?.includes("estimatedMinutes") &&
          existing.userOverrides.estimatedMinutes !== undefined)
      ) {
        ensureActivityTime(parsed.id, database);
        database
          .update(activityTime)
          .set({ userEstimateUpdatedAt: now })
          .where(eq(activityTime.activityId, parsed.id))
          .run();
        timeFields.push("estimatedMinutes");
      }
      if (timeFields.length) emitTimeChange(parsed.id, origin, receipt, timeFields, database, now);
      if (updated.userState !== existing.userState)
        enqueueEvent(
          "activity.status_changed",
          updated,
          origin,
          receipt,
          database,
          now,
          existing.userState,
        );
    },
    database,
  );
}

export function createUserActivity(input: unknown, database = getDatabase()): ActivityReceipt {
  const parsed = parse(createHomeActivityInput, input);
  return writeActivity(
    "user-create",
    parsed,
    [parsed.id],
    (receipt, now) => {
      if (database.select().from(activities).where(eq(activities.id, parsed.id)).get())
        fail("invalid-input", "This activity ID is already in use.");
      const { id, title, nextAction, section } = parsed;
      const row: typeof activities.$inferSelect = {
        id,
        number: allocateActivityNumber(database),
        origin: "user",
        readAt: now,
        proposal: {
          id,
          kind: "task",
          title,
          nextAction,
          recommendation: { section },
          sources: [],
        },
        userState: "available",
        userOverrides: { title, nextAction, section },
        assessment: null,
        createdAt: now,
        updatedAt: now,
      };
      database.insert(activities).values(row).run();
      enqueueEvent("activity.created", row, "user", receipt, database, now);
    },
    database,
  );
}

/** Save the agent's contextual assessment; evidence is reported context, not delivery proof. */
export function updateActivityProgress(input: unknown, database = getDatabase()): ActivityReceipt {
  const parsed = parse(updateActivityProgressInput, input);
  return writeActivity(
    "progress",
    parsed,
    [parsed.id],
    (receipt, now) => {
      const existing = database.select().from(activities).where(eq(activities.id, parsed.id)).get();
      if (!existing) fail("invalid-input", "This activity does not exist.");
      if (parsed.draft !== undefined && existing.proposal.kind !== "reply")
        fail("invalid-input", "Only reply activities have drafts.");
      const proposal =
        existing.proposal.kind === "reply" && parsed.draft !== undefined
          ? { ...existing.proposal, reply: { ...existing.proposal.reply, draft: parsed.draft } }
          : existing.proposal;
      const updated = {
        ...existing,
        proposal,
        userState: parsed.state ?? existing.userState,
        assessment: {
          reason: parsed.reason,
          evidence: parsed.evidence,
          updatedAt: receipt.receivedAt,
        },
        updatedAt: now,
      };
      database
        .update(activities)
        .set({
          proposal,
          userState: updated.userState,
          assessment: updated.assessment,
          updatedAt: now,
        })
        .where(eq(activities.id, parsed.id))
        .run();
      const timeFields: string[] = [];
      if (
        !["available", "inProgress"].includes(updated.userState) &&
        endActivityFocus(parsed.id, database, now)
      )
        timeFields.push("actualSeconds");
      if (parsed.remainingMinutes !== undefined) {
        setRemaining(existing, parsed.remainingMinutes, parsed.reason, "agent", database, now);
        const record = database
          .select()
          .from(activityTime)
          .where(eq(activityTime.activityId, parsed.id))
          .get();
        if (!record?.remainingOverride) timeFields.push("remainingMinutes");
      }
      if (timeFields.length) emitTimeChange(parsed.id, "agent", receipt, timeFields, database, now);
      if (updated.userState !== existing.userState)
        enqueueEvent(
          "activity.status_changed",
          updated,
          "agent",
          receipt,
          database,
          now,
          existing.userState,
        );
    },
    database,
  );
}
