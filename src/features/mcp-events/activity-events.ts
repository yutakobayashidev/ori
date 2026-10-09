import { z } from "zod";

export const activityEventName = z.enum([
  "activity.created",
  "activity.status_changed",
  "activity.time_changed",
]);
export type ActivityEventName = z.infer<typeof activityEventName>;
const origin = z.enum(["user", "agent"]);
const state = z.enum(["available", "inProgress", "waiting", "deferred", "completed", "dismissed"]);
export const activityEventFilters = z.strictObject({
  origins: z.array(origin).min(1).max(2).default(["user"]),
  activityIds: z.array(z.string().min(1).max(128)).min(1).max(50).optional(),
});
const activityEventPayload = z.strictObject({
  activityId: z.string().min(1).max(128),
  kind: z.enum(["task", "reply"]),
  title: z.string().min(1).max(300),
  nextAction: z.string().min(1).max(2000),
  state,
  previousState: state.optional(),
  origin,
  requestId: z.string().min(1).max(128),
  revision: z.number().int().nonnegative(),
  occurredAt: z.iso.datetime({ offset: true }),
});
export type ActivityEventData = z.infer<typeof activityEventPayload>;
export const createdActivityPayload = activityEventPayload.omit({ previousState: true });
export const changedActivityPayload = activityEventPayload.extend({ previousState: state });
export const timeChangedActivityPayload = activityEventPayload
  .pick({
    activityId: true,
    origin: true,
    requestId: true,
    revision: true,
    occurredAt: true,
  })
  .extend({ changedFields: z.array(z.string().min(1).max(64)).min(1).max(10) });
export type ActivityTimeEventData = z.infer<typeof timeChangedActivityPayload>;
