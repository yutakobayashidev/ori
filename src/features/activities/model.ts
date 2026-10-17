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
  timeEstimate: z
    .strictObject({ estimatedMinutes: z.number().int().positive(), reason: required(2000) })
    .optional(),
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
  activityNumbers: z.array(z.number().int().positive()).max(50).optional(),
  conversation: z
    .strictObject({ targetId: sourceId, accountId: sourceId, chatId: sourceId })
    .optional(),
  states: z.array(activityState).max(6).optional(),
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
  estimatedMinutes: z.number().int().positive().optional(),
  remainingMinutes: z.number().int().nonnegative().optional(),
});
export const updateActivityUserInput = z
  .strictObject({
    requestId: id,
    expectedRevision: z.number().int().nonnegative(),
    id,
    state: activityState.optional(),
    overrides: activityOverrides.optional(),
    resetOverrides: z
      .array(
        z.enum([
          "title",
          "nextAction",
          "detail",
          "draft",
          "section",
          "estimatedMinutes",
          "remainingMinutes",
        ]),
      )
      .max(7)
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
const progressEvidence = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("beeper_message"),
    targetId: sourceId,
    accountId: sourceId,
    chatId: sourceId,
    messageId: sourceId,
  }),
  z.strictObject({
    kind: z.literal("external"),
    reference: required(2048),
    observedAt: z.iso.datetime({ offset: true }),
    summary: required(4000),
  }),
]);
export const updateActivityProgressInput = z
  .strictObject({
    requestId: id,
    expectedRevision: z.number().int().nonnegative(),
    id,
    reason: required(2000),
    state: activityState.optional(),
    draft: required(16000).optional(),
    remainingMinutes: z.number().int().nonnegative().optional(),
    evidence: z.array(progressEvidence).min(1).max(20),
  })
  .refine(
    (value) =>
      value.state !== undefined ||
      value.draft !== undefined ||
      value.remainingMinutes !== undefined,
    "Choose a state, draft or remaining-time change.",
  );
export type ActivityAssessment = {
  reason: string;
  evidence: z.infer<typeof progressEvidence>[];
  updatedAt: string;
};
export type ActivityState = z.infer<typeof activityState>;
export type ActivityOverrides = z.infer<typeof activityOverrides>;
export type Activity = {
  id: string;
  number: number;
  origin?: "user" | "agent";
  isUnread: boolean;
  proposal: ActivityProposal;
  userState: ActivityState;
  completedAt: string | null;
  userOverrides: ActivityOverrides;
  assessment?: ActivityAssessment | null;
  time?: import("../focus/model").ActivityTime;
  effective: ActivityProposal & { section: "focus" | "optional" };
};
export type ActivityContext = {
  ok: true;
  revision: number;
  activities: Activity[];
  missingActivityIds: string[];
  missingActivityNumbers: number[];
  nextCursor: string | null;
  serverNow?: number;
  focusSession?: import("../focus/model").FocusSession | null;
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
  | "state-conflict"
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
