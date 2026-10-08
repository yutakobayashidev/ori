import { z } from "zod";

const executionStatus = z.enum([
  "queued",
  "running",
  "waiting_input",
  "review",
  "failed",
  "cancelled",
  "interrupted",
]);
const executionToolCall = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.json()),
  status: z.enum(["running", "completed", "failed"]),
  result: z
    .object({
      content: z.array(z.record(z.string(), z.json())).optional(),
      structuredContent: z.record(z.string(), z.json()).optional(),
      _meta: z.record(z.string(), z.json()).optional(),
      isError: z.boolean().optional(),
    })
    .optional(),
  afterMessageId: z.string().optional(),
});
export type ExecutionToolCall = z.infer<typeof executionToolCall>;

export const executionRun = z.object({
  id: z.string(),
  activityId: z.string().optional(),
  status: executionStatus,
  threadId: z.string().nullable().optional(),
  messages: z.array(
    z.object({ id: z.string(), role: z.enum(["user", "assistant"]), text: z.string() }),
  ),
  toolCalls: z.array(executionToolCall).default([]),
  error: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  artifacts: z.array(z.object({ path: z.string(), size: z.number() })).default([]),
  pendingInput: z
    .object({
      requestId: z.union([z.string(), z.number()]),
      questions: z.array(
        z.object({
          id: z.string(),
          header: z.string(),
          question: z.string(),
          isOther: z.boolean().optional(),
          isSecret: z.boolean().optional(),
          options: z
            .array(z.object({ label: z.string(), description: z.string() }))
            .nullable()
            .optional(),
        }),
      ),
    })
    .nullable()
    .optional(),
  handoff: z.object({ instructions: z.string(), completionCriteria: z.string() }).optional(),
});
export type ExecutionRun = z.infer<typeof executionRun>;
export type ExecutionFailure = { ok: false; error: { message: string } };
export const handoffInput = z.strictObject({
  activityId: z.string().min(1).max(128),
  requestId: z.string().uuid(),
  instructions: z.string().trim().min(1).max(16000),
  completionCriteria: z.string().trim().max(8000).default(""),
});
export const executionIdInput = z.strictObject({ id: z.string().uuid() });
export const followupInput = executionIdInput.extend({
  requestId: z.string().uuid(),
  text: z.string().trim().min(1).max(16000),
});
export const answerInput = executionIdInput.extend({
  requestId: z.union([z.string().min(1).max(128), z.number().int()]),
  answers: z.record(
    z.string().min(1).max(128),
    z.object({ answers: z.array(z.string().max(16000)).min(1).max(10) }),
  ),
});
