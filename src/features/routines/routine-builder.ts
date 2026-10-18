import { z } from "zod";
import { routineDraftSchema, routineDraftShapeSchema } from "./routine-model";

export const routineBuilderReplySchema = z.strictObject({
  message: z.string().min(1).max(3000),
  questions: z.array(z.string().min(1).max(500)).max(3),
  missingFields: z.array(z.string().min(1).max(200)).max(30),
  draft: routineDraftShapeSchema.nullable(),
});
export const routineBuilderInputSchema = z
  .strictObject({
    messages: z
      .array(
        z.strictObject({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(6000) }),
      )
      .min(1)
      .max(80),
    currentDraft: routineDraftShapeSchema.nullable(),
  })
  .refine((input) => input.messages.at(-1)?.role === "user", "A new message is required.");
export type RoutineBuilderReply = z.infer<typeof routineBuilderReplySchema>;
export type RoutineBuilderMessage = z.infer<typeof routineBuilderInputSchema>["messages"][number];
export function canSaveRoutine(reply: RoutineBuilderReply | null): boolean {
  return Boolean(
    reply &&
    !reply.missingFields.length &&
    !reply.questions.length &&
    routineDraftSchema.safeParse(reply.draft).success,
  );
}
