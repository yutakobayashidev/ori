import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import type { ActivityEventName } from "../mcp-events/activity-events";
import { enqueueActivityEvent } from "../mcp-events/events.server";
import { getDatabase, type AppDatabase } from "../storage/database.server";
import { activities, activityReceipts, activityRevision } from "../storage/schema";
import { notifyActivities } from "./events.server";
import {
  createHomeActivityInput,
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
function revision(database: AppDatabase) {
  return (
    database.select().from(activityRevision).where(eq(activityRevision.id, 1)).get()?.revision ?? 0
  );
}
function activity(row: typeof activities.$inferSelect): Activity {
  const { proposal, userState, userOverrides } = row;
  const { draft, section, ...common } = userOverrides;
  const effective = {
    ...proposal,
    ...common,
    section: section ?? proposal.recommendation?.section ?? ("optional" as const),
  };
  if (effective.kind === "reply" && draft !== undefined)
    effective.reply = { ...effective.reply, draft };
  return { id: row.id, proposal, userState, userOverrides, effective };
}
const cursorSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  filter: z.string(),
  after: z.string().min(1).max(128),
});
export function getActivityContext(input: unknown = {}, database = getDatabase()): ActivityContext {
  const parsed = parse(getActivityContextInput, input);
  const ids = parsed.activityIds ? [...new Set(parsed.activityIds)].sort() : undefined;
  const filter = hash({ activityIds: ids, limit: parsed.limit });
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
    const current = revision(database);
    if (cursor && cursor.revision !== current)
      fail("stale-cursor", "Activities changed. Restart from the first page.");
    const rows = database
      .select()
      .from(activities)
      .where(
        and(
          ids ? inArray(activities.id, ids) : undefined,
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
    return {
      ok: true,
      revision: current,
      activities: page.map(activity),
      missingActivityIds: ids?.filter((id) => !existing?.has(id)) ?? [],
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
    revision: revision(database),
    activities: database.select().from(activities).orderBy(asc(activities.id)).all().map(activity),
    missingActivityIds: [],
    nextCursor: null,
  }));
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
function enqueueEvent(
  name: ActivityEventName,
  row: typeof activities.$inferSelect,
  origin: "user" | "agent",
  receipt: ActivityReceipt,
  database: AppDatabase,
  now: number,
  previousState?: ActivityState,
) {
  const { effective } = activity(row);
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
function write(
  operation: string,
  input: { requestId: string; expectedRevision: number },
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
      const current = revision(database);
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
      mutate(result, now);
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
export function publishActivities(input: unknown, database = getDatabase()): ActivityReceipt {
  checkSize(input);
  const parsed = parse(publishActivitiesInput, input);
  return write(
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
        database
          .insert(activities)
          .values({
            id: proposal.id,
            proposal,
            userState: "available",
            userOverrides: {},
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({ target: activities.id, set: { proposal, updatedAt: now } })
          .run();
        if (!existing)
          enqueueEvent(
            "activity.created",
            {
              id: proposal.id,
              proposal,
              userState: "available",
              userOverrides: {},
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
  return write(
    origin === "user" ? "user" : "agent-decision",
    parsed,
    [parsed.id],
    (receipt, now) => {
      const existing = database.select().from(activities).where(eq(activities.id, parsed.id)).get();
      if (!existing) fail("invalid-input", "This activity does not exist.");
      if (existing.proposal.kind === "reply" && parsed.state === "completed")
        fail("invalid-input", "A reply can complete only after confirmed delivery.");
      if (
        existing.proposal.kind === "task" &&
        (parsed.overrides?.draft !== undefined || parsed.resetOverrides?.includes("draft"))
      )
        fail("invalid-input", "Only reply activities have drafts.");
      const userOverrides = { ...existing.userOverrides, ...parsed.overrides };
      for (const key of parsed.resetOverrides ?? []) delete userOverrides[key];
      const updated = {
        ...existing,
        userState: parsed.state ?? existing.userState,
        userOverrides,
        updatedAt: now,
      };
      database
        .update(activities)
        .set({
          userState: updated.userState,
          userOverrides,
          updatedAt: now,
        })
        .where(eq(activities.id, parsed.id))
        .run();
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
  return write(
    "user-create",
    parsed,
    [parsed.id],
    (receipt, now) => {
      if (database.select().from(activities).where(eq(activities.id, parsed.id)).get())
        fail("invalid-input", "This activity ID is already in use.");
      const { id, title, nextAction, section } = parsed;
      const row: typeof activities.$inferSelect = {
        id,
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
        createdAt: now,
        updatedAt: now,
      };
      database.insert(activities).values(row).run();
      enqueueEvent("activity.created", row, "user", receipt, database, now);
    },
    database,
  );
}
