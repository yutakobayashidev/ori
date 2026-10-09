import { and, asc, eq } from "drizzle-orm";
import {
  ActivityPersistenceError,
  writeActivity,
  activityRevisionNumber,
} from "../activities/repository.server";
import { getDatabase } from "../storage/database.server";
import { activities, daySelections } from "../storage/schema";
import { getDayPlanInput, updateDayPlanInput, type DayPlan } from "./model";

export function getDayPlan(input: unknown, database = getDatabase()): DayPlan {
  const parsed = getDayPlanInput.safeParse(input);
  if (!parsed.success)
    throw new ActivityPersistenceError("invalid-input", "Choose a valid date and IANA time zone.");
  return database.transaction(() => ({
    ok: true as const,
    ...parsed.data,
    revision: activityRevisionNumber(database),
    selections: database
      .select()
      .from(daySelections)
      .where(eq(daySelections.date, parsed.data.date))
      .orderBy(asc(daySelections.rank), asc(daySelections.activityId))
      .all(),
  }));
}
export function updateDayPlan(input: unknown, origin: "user" | "agent", database = getDatabase()) {
  const parsed = updateDayPlanInput.safeParse(input);
  if (!parsed.success)
    throw new ActivityPersistenceError(
      "invalid-input",
      "Check the date, time zone and candidate changes.",
    );
  const data = parsed.data;
  return writeActivity(
    "update-day-plan",
    { ...data, origin },
    data.changes.map((change) => change.activityId),
    (_receipt, now) => {
      const ownerChoices =
        origin === "agent"
          ? database
              .select()
              .from(daySelections)
              .where(eq(daySelections.date, data.date))
              .all()
              .filter((entry) => entry.userAdjustedAt !== null && !entry.excluded)
          : [];
      for (const change of data.changes) {
        const activity = database
          .select()
          .from(activities)
          .where(eq(activities.id, change.activityId))
          .get();
        if (!activity)
          throw new ActivityPersistenceError(
            "invalid-input",
            "A candidate activity no longer exists.",
          );
        const previous = database
          .select()
          .from(daySelections)
          .where(
            and(eq(daySelections.date, data.date), eq(daySelections.activityId, change.activityId)),
          )
          .get();
        if (origin === "agent" && previous?.userAdjustedAt != null)
          throw new ActivityPersistenceError(
            "state-conflict",
            "This candidate was adjusted by the owner. Preserve their choice.",
          );
        if (
          origin === "agent" &&
          !change.excluded &&
          ownerChoices.some(
            (entry) => entry.section === change.section && entry.rank >= change.rank,
          )
        )
          throw new ActivityPersistenceError(
            "state-conflict",
            "Add new candidates after the owner’s choices; preserve their order.",
          );
        database
          .insert(daySelections)
          .values({
            ...change,
            date: data.date,
            timeZone: data.timeZone,
            origin,
            reason: data.reason,
            userAdjustedAt: origin === "user" ? now : null,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [daySelections.date, daySelections.activityId],
            set: {
              ...change,
              timeZone: data.timeZone,
              origin,
              reason: data.reason,
              userAdjustedAt: origin === "user" ? now : null,
              updatedAt: now,
            },
          })
          .run();
      }
    },
    database,
  );
}
