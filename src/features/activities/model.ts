import { z } from "zod";

const id = z.string().min(1).max(128);
const sourceId = z.string().min(1).max(256);
const required = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value.trim().length > 0);
const section = z.enum(["focus", "optional"]);
const activityState = z.enum([
  "available",
  "inProgress",
  "waiting",
  "deferred",
  "completed",
  "dismissed",
]);
const messageSource = z.strictObject({
  id: sourceId,
  kind: z.literal("message"),
  provider: z.literal("beeper"),
  targetId: sourceId,
  accountId: sourceId,
  chatId: sourceId,
  messageId: sourceId,
  observedAt: z.iso.datetime({ offset: true }),
  excerpt: z.string().max(4000),
});
const lifeSource = z.strictObject({
  id: sourceId,
  kind: z.literal("life"),
  path: required(1024).refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").some((part) => part === ".." || part === "." || part === ""),
  ),
  contentHash: z.string().regex(/^[a-fA-F0-9]{64}$/),
  observedAt: z.iso.datetime({ offset: true }),
});
const base = {
  id,
  title: required(300),
  nextAction: required(2000),
  detail: z.string().max(8000).optional(),
  recommendation: z.strictObject({ section, reason: z.string().max(2000).optional() }).optional(),
  sources: z.array(z.discriminatedUnion("kind", [messageSource, lifeSource])).max(20),
};
const activityProposal = z
  .discriminatedUnion("kind", [
    z.strictObject({ ...base, kind: z.literal("task") }),
    z.strictObject({
      ...base,
      kind: z.literal("reply"),
      reply: z.strictObject({
        recipientName: required(300),
        sourceId,
        context: required(8000),
        draft: required(16000).optional(),
      }),
    }),
  ])
  .superRefine((value, ctx) => {
    if (new Set(value.sources.map((source) => source.id)).size !== value.sources.length)
      ctx.addIssue({ code: "custom", message: "Source IDs must be unique." });
    if (
      value.kind === "reply" &&
      !value.sources.some(
        (source) => source.kind === "message" && source.id === value.reply.sourceId,
      )
    )
      ctx.addIssue({ code: "custom", message: "The reply must reference a message source." });
  });
export const getActivityContextInput = z.strictObject({
  activityIds: z.array(id).max(50).optional(),
  cursor: z.string().max(4096).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const publishActivitiesInput = z
  .strictObject({
    requestId: id,
    expectedRevision: z.number().int().nonnegative(),
    activities: z.array(activityProposal).min(1).max(50),
  })
  .refine(
    (value) =>
      new Set(value.activities.map((activity) => activity.id)).size === value.activities.length,
    "Activity IDs must be unique.",
  );
const activityOverrides = z.strictObject({
  title: required(300).optional(),
  nextAction: required(2000).optional(),
  detail: z.string().max(8000).optional(),
  draft: z.string().max(16000).optional(),
  section: section.optional(),
});
export const updateActivityUserInput = z
  .strictObject({
    requestId: id,
    expectedRevision: z.number().int().nonnegative(),
    id,
    state: activityState.optional(),
    overrides: activityOverrides.optional(),
    resetOverrides: z
      .array(z.enum(["title", "nextAction", "detail", "draft", "section"]))
      .max(5)
      .optional(),
  })
  .refine(
    (value) =>
      value.state !== undefined ||
      Object.keys(value.overrides ?? {}).length > 0 ||
      (value.resetOverrides?.length ?? 0) > 0,
    "Choose a change.",
  )
  .refine(
    (value) => !value.resetOverrides?.some((key) => value.overrides?.[key] !== undefined),
    "Do not set and reset the same field.",
  );
export type ActivityProposal = z.infer<typeof activityProposal>;
export type ActivityState = z.infer<typeof activityState>;
export type ActivityOverrides = z.infer<typeof activityOverrides>;
export type Activity = {
  id: string;
  proposal: ActivityProposal;
  userState: ActivityState;
  userOverrides: ActivityOverrides;
  effective: ActivityProposal & { section: "focus" | "optional" };
};
export type ActivityContext = {
  ok: true;
  revision: number;
  activities: Activity[];
  missingActivityIds: string[];
  nextCursor: string | null;
};
export type ActivityReceipt = {
  ok: true;
  requestId: string;
  revision: number;
  activityIds: string[];
  receivedAt: string;
};
export type ActivityErrorCode =
  | "invalid-input"
  | "payload-too-large"
  | "revision-conflict"
  | "idempotency-conflict"
  | "stale-cursor"
  | "immutable-field"
  | "internal-error";
export type ActivityFailure = { ok: false; error: { code: ActivityErrorCode; message: string } };
export const createHomeActivityInput = z.strictObject({
  requestId: id,
  expectedRevision: z.number().int().nonnegative(),
  id,
  title: required(300),
  nextAction: required(2000),
  section,
});
