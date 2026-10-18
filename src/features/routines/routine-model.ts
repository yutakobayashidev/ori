import { z } from "zod";

const label = z.string().trim().min(1).max(200);
const identifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
export const routineMetricSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_.-]{0,99}$/),
  label,
  group: z.string().regex(/^[a-z][a-z0-9_.-]{0,99}$/),
});
export type RoutineMetric = z.infer<typeof routineMetricSchema> & { unit: string | null };

export const routineFieldSchema = z
  .strictObject({
    id: identifier,
    label,
    type: z.enum(["number", "text", "boolean", "choice", "multiChoice"]),
    required: z.boolean(),
    unit: label.nullable(),
    metric: routineMetricSchema.nullable().optional(),
    options: z.array(z.strictObject({ value: identifier, label })).max(100),
    min: z.number().finite().nullable(),
    max: z.number().finite().nullable(),
  })
  .superRefine((field, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (field.min !== null && field.max !== null && field.min > field.max)
      issue("Minimum exceeds maximum.");
    if (
      field.type !== "number" &&
      (field.min !== null || field.max !== null || field.unit !== null)
    )
      issue("Only number fields support bounds and units.");
    if (field.metric && field.type !== "number")
      issue("Only number fields support shared metrics.");
    const choice = field.type === "choice" || field.type === "multiChoice";
    if (choice !== field.options.length > 0)
      issue("Choice fields require options; other fields must not have options.");
    if (new Set(field.options.map((option) => option.value)).size !== field.options.length)
      issue("Duplicate option values.");
  });
export const routineStepSchema = z
  .strictObject({
    id: identifier,
    label,
    repeatable: z.boolean(),
    layout: z.enum(["stack", "inline"]),
    fields: z.array(routineFieldSchema).max(30),
  })
  .superRefine((step, ctx) => {
    if (new Set(step.fields.map((field) => field.id)).size !== step.fields.length)
      ctx.addIssue({ code: "custom", message: "Duplicate field IDs." });
    const metrics = step.fields.flatMap((field) => (field.metric ? [field.metric.id] : []));
    if (new Set(metrics).size !== metrics.length)
      ctx.addIssue({ code: "custom", message: "Duplicate metrics in a step." });
  });
export const routineScheduleSchema = z
  .strictObject({
    id: identifier,
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    timeOfDay: z.enum(["morning", "afternoon", "evening", "bedtime", "anytime"]),
    time: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    timeZone: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Invalid time zone."),
  })
  .refine(
    (schedule) => new Set(schedule.weekdays).size === schedule.weekdays.length,
    "Duplicate weekdays.",
  );
export type RoutineSchedule = z.infer<typeof routineScheduleSchema>;
export const routineDraftShapeSchema = z.strictObject({
  name: label,
  description: z.string().max(2000),
  aliases: z.array(label).max(30),
  schedules: z.array(routineScheduleSchema).min(1).max(30),
  steps: z.array(routineStepSchema).length(1),
});
function uniqueDefinition(
  draft: { aliases: string[]; schedules: RoutineSchedule[]; steps: Array<{ id: string }> },
  ctx: z.RefinementCtx,
) {
  for (const [name, values] of [
    ["step IDs", draft.steps.map((step) => step.id)],
    ["aliases", draft.aliases],
    ["schedule IDs", draft.schedules.map((schedule) => schedule.id)],
  ] as const) {
    if (new Set(values).size !== values.length)
      ctx.addIssue({ code: "custom", message: `Duplicate ${name}.` });
  }
}
export const routineDraftSchema = routineDraftShapeSchema.superRefine(uniqueDefinition);
// Historical versions retain their original forms; only newly saved drafts require one action.
export const routineDefinitionSchema = routineDraftShapeSchema
  .extend({
    steps: z.array(routineStepSchema).min(1).max(30),
    id: z.uuid(),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .superRefine(uniqueDefinition);
const saveRoutineItemSchema = z
  .strictObject({
    routineId: z.uuid().nullable(),
    baseVersion: z.number().int().positive().nullable(),
    draft: routineDraftSchema,
  })
  .refine(
    (input) => (input.routineId === null) === (input.baseVersion === null),
    "Editing requires the current version.",
  );
export const saveRoutineInputSchema = saveRoutineItemSchema.safeExtend({ requestId: z.uuid() });
export const saveRoutinesInputSchema = z
  .strictObject({
    requestId: z.uuid(),
    routines: z.array(saveRoutineItemSchema).min(1).max(30),
  })
  .refine((input) => {
    const ids = input.routines.flatMap((routine) => (routine.routineId ? [routine.routineId] : []));
    return new Set(ids).size === ids.length;
  }, "A routine can only be updated once per batch.");
export type SaveRoutinesInput = z.infer<typeof saveRoutinesInputSchema>;
export const routineValueSchema = z.union([
  z.string().max(10000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(200)).max(100),
]);
export const routineRunInputSchema = z.strictObject({
  id: z.uuid(),
  routineId: z.uuid(),
  routineVersion: z.number().int().positive(),
  scheduleId: identifier.nullable().optional(),
  occurredAt: z.iso.datetime({ offset: true }),
  steps: z
    .array(
      z.strictObject({
        stepId: identifier,
        occurredAt: z.iso.datetime({ offset: true }).optional(),
        done: z.boolean(),
        entries: z.array(z.record(identifier, routineValueSchema)).max(100),
      }),
    )
    .min(1)
    .max(30),
});
export const routineRunSchema = routineRunInputSchema.extend({
  recordedAt: z.iso.datetime({ offset: true }),
});
export type RoutineField = z.infer<typeof routineFieldSchema>;
export type RoutineStep = z.infer<typeof routineStepSchema>;
export type RoutineDraft = z.infer<typeof routineDraftSchema>;
export type RoutineDefinition = z.infer<typeof routineDefinitionSchema>;
export type RoutineRun = z.infer<typeof routineRunSchema>;
export type RoutineRunInput = z.infer<typeof routineRunInputSchema>;
export type SaveRoutineInput = z.infer<typeof saveRoutineInputSchema>;

export function validateRoutineRun(definition: RoutineDefinition, input: RoutineRunInput): void {
  if (
    input.scheduleId &&
    !definition.schedules.some((schedule) => schedule.id === input.scheduleId)
  )
    throw new Error("Unknown routine schedule.");
  if (
    !input.steps.some(
      (step) =>
        step.done ||
        step.entries.some((entry) =>
          Object.values(entry).some(
            (value) => value !== "" && (!Array.isArray(value) || value.length > 0),
          ),
        ),
    )
  )
    throw new Error("Record a completed step or a value before saving.");
  if (
    input.steps.length !== definition.steps.length ||
    new Set(input.steps.map((step) => step.stepId)).size !== input.steps.length
  )
    throw new Error("Every step must appear exactly once.");
  for (const result of input.steps) {
    const step = definition.steps.find((candidate) => candidate.id === result.stepId);
    if (!step) throw new Error("Unknown routine step.");
    if (!step.repeatable && result.entries.length > 1)
      throw new Error("This step accepts one entry.");
    if (!step.fields.length && result.entries.length)
      throw new Error("Done-only steps do not accept values.");
    if (result.done && step.fields.length && !result.entries.length)
      throw new Error("Completed steps require an entry.");
    for (const entry of result.entries) {
      if (Object.keys(entry).some((id) => !step.fields.some((field) => field.id === id)))
        throw new Error("Unknown routine field.");
      for (const field of step.fields) {
        const value = entry[field.id];
        if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) {
          if (field.required && result.done) throw new Error(`${field.label} is required.`);
          continue;
        }
        if (field.type === "number") {
          if (
            typeof value !== "number" ||
            (field.min !== null && value < field.min) ||
            (field.max !== null && value > field.max)
          )
            throw new Error(`Invalid ${field.label}.`);
        } else if (field.type === "boolean") {
          if (typeof value !== "boolean") throw new Error(`Invalid ${field.label}.`);
        } else if (field.type === "text") {
          if (typeof value !== "string") throw new Error(`Invalid ${field.label}.`);
        } else {
          const values = field.type === "choice" ? [value] : value;
          if (
            !Array.isArray(values) ||
            (field.type === "choice" && typeof value !== "string") ||
            values.some(
              (item) =>
                typeof item !== "string" || !field.options.some((option) => option.value === item),
            ) ||
            new Set(values).size !== values.length
          )
            throw new Error(`Invalid ${field.label}.`);
        }
      }
    }
  }
}
