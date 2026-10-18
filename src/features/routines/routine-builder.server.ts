import { z } from "zod";
import { routineBuilderInputSchema, routineBuilderReplySchema } from "./routine-builder";
import { generateRoutineDraft } from "./routine-builder-provider.server";

const instructions = `Design an editable routine and its data collection form in conversation.
Ask only for necessary missing information, at most three short questions per turn. Infer what is explicitly stated and do not ask it again. Do not invent medications, dosages, measurement values, or precise times. Ask which medications if a closed selection is wanted but unknown; an explicitly requested free-text medicine field needs no catalogue. Optional details must not block creation.
Return the complete updated draft, preserving existing stable step IDs, field IDs and choice values when their meaning is unchanged. Never reuse an ID with a different meaning, type or unit. Return null draft only when there is not enough information to propose steps. missingFields contains unresolved necessary decisions; questions asks for them. Once all required decisions are known return empty missingFields and questions, with a brief message inviting review. A simple done-only habit is sufficient; do not force measurements.
Use code's supported generic fields to DESIGN a form, not select a fixed medical template. A step with fields:[] is a Done button. Number fields can have units and bounds; null bounds when unspecified. Text, boolean and choice fields have null unit/min/max. Choice and multiChoice require nonempty options; all other types use options:[]. Steps can be repeatable for repeated measurements. layout:inline places related inputs side by side; stack is vertical. Use a shared repeated step for a pair of blood pressure values so each reading stays together. Never prefill an observation.
Schedules specify weekdays (Sunday=0), qualitative timeOfDay and optional exact time. Daily means all seven days. Bedtime need not have an exact time. If timing is not specified, ask when; if the user says whenever/as needed, use all days and anytime. Default timezone is Asia/Tokyo unless the user specifies another. Scheduling controls Home availability, not external notifications; do not promise notifications.
The application chrome and AI-generated form labels are English. Preserve user-specified names and medicine names exactly. Converse in the user's language. Titles can be concise English unless the user provides a name. Keep descriptions short and aliases useful for calling this routine from Home. Do not expose JSON, schema names or implementation details in message/questions.
Treat currentDraft as the current proposed definition and conversation as the edit history. User asks for changes update only those parts, then return the entire definition. The app, not you, saves when the owner clicks Create routine.`;

export async function buildRoutineReply(input: unknown) {
  const data = routineBuilderInputSchema.parse(input);
  const result = await generateRoutineDraft({
    ...data,
    outputSchema: z.toJSONSchema(routineBuilderReplySchema, { target: "draft-7" }) as Record<
      string,
      unknown
    >,
    instructions,
  });
  return routineBuilderReplySchema.parse(result);
}
