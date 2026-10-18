import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  routineDefinitionSchema,
  routineCancellationSchema,
  undoRoutineRunInputSchema,
  type RoutineCancellation,
  routineRunInputSchema,
  routineRunSchema,
  saveRoutineInputSchema,
  saveRoutinesInputSchema,
  validateRoutineRun,
  type RoutineDefinition,
  type RoutineMetric,
  type RoutineRun,
} from "./routine-model";
import { routineDateForSchedule, routineDay } from "./routine-schedule";

const storedDefinition = z.preprocess((value) => {
  if (typeof value !== "object" || value === null || !("schedule" in value)) return value;
  const { schedule, ...definition } = value;
  return {
    ...definition,
    schedules: [{ id: "default", ...(schedule as object) }],
  };
}, routineDefinitionSchema);
const definitionRecord = z.union([
  z.strictObject({ requestId: z.uuid(), definition: storedDefinition }),
  z.strictObject({
    requestId: z.uuid(),
    definitions: z.array(storedDefinition).min(1),
  }),
]);
const queues = new Map<string, Promise<unknown>>();
const day = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function directory() {
  return resolve(
    process.env.TWITTER_LITE_ROUTINE_DIR || join(homedir(), ".local/state/twitter-lite/routines"),
  );
}
async function serialized<T>(dir: string, operation: () => Promise<T>): Promise<T> {
  const pending = (queues.get(dir) ?? Promise.resolve()).catch(() => undefined).then(operation);
  queues.set(dir, pending);
  try {
    return await pending;
  } finally {
    if (queues.get(dir) === pending) queues.delete(dir);
  }
}
async function readLines<T>(path: string, schema: z.ZodType<T>): Promise<T[]> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  if (content && !content.endsWith("\n")) throw new Error("Incomplete routine storage record.");
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => schema.parse(JSON.parse(line)));
}
async function append(dir: string, fileName: string, value: unknown) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = await open(join(dir, fileName), "a", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(value)}\n`);
    await file.sync();
  } finally {
    await file.close();
  }
}
async function definitions(dir: string) {
  const records = await readLines(join(dir, "definitions.jsonl"), definitionRecord);
  return records.flatMap((record) =>
    ("definitions" in record ? record.definitions : [record.definition]).map((definition) => ({
      requestId: record.requestId,
      definition,
    })),
  );
}
async function runs(dir: string): Promise<RoutineRun[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records: RoutineRun[] = [];
  for (const name of names.filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort())
    records.push(...(await readLines(join(dir, name), routineRunSchema)));
  return records.reverse();
}
async function activeRuns(dir: string): Promise<RoutineRun[]> {
  const cancelled = new Set(
    (await readLines(join(dir, "cancellations.jsonl"), routineCancellationSchema)).map(
      (record) => record.runId,
    ),
  );
  return (await runs(dir)).filter((run) => !cancelled.has(run.id));
}
export function undoRoutineRun(input: unknown): Promise<RoutineCancellation> {
  const parsed = undoRoutineRunInputSchema.parse(input);
  const dir = directory();
  return serialized(dir, async () => {
    const cancellations = await readLines(
      join(dir, "cancellations.jsonl"),
      routineCancellationSchema,
    );
    const existing = cancellations.find((record) => record.requestId === parsed.requestId);
    if (existing) {
      if (existing.runId !== parsed.runId)
        throw new Error("This request ID has already been used.");
      return existing;
    }
    if (!(await runs(dir)).some((run) => run.id === parsed.runId))
      throw new Error("Routine run does not exist.");
    const record = { ...parsed, recordedAt: new Date().toISOString() };
    await append(dir, "cancellations.jsonl", record);
    return record;
  });
}
export function listRoutines(): Promise<RoutineDefinition[]> {
  const dir = directory();
  return serialized(dir, async () => {
    const latest = new Map<string, RoutineDefinition>();
    for (const record of await definitions(dir))
      latest.set(record.definition.id, record.definition);
    return [...latest.values()];
  });
}
function metricCatalogue(definitions: RoutineDefinition[]): RoutineMetric[] {
  const metrics = new Map<string, RoutineMetric>();
  for (const definition of definitions) {
    for (const step of definition.steps) {
      for (const field of step.fields) {
        if (!field.metric) continue;
        const metric = { ...field.metric, unit: field.unit };
        const existing = metrics.get(metric.id);
        if (
          existing &&
          (existing.unit !== metric.unit ||
            existing.label !== metric.label ||
            existing.group !== metric.group)
        )
          throw new Error(`Metric ${metric.id} must keep its label, group and unit.`);
        metrics.set(metric.id, metric);
      }
    }
  }
  return [...metrics.values()];
}
export function listRoutineMetrics(): Promise<RoutineMetric[]> {
  const dir = directory();
  return serialized(dir, async () =>
    metricCatalogue((await definitions(dir)).map((record) => record.definition)),
  );
}
export async function saveRoutine(input: unknown): Promise<RoutineDefinition> {
  const { requestId, ...routine } = saveRoutineInputSchema.parse(input);
  const [definition] = await saveRoutines({ requestId, routines: [routine] });
  if (!definition) throw new Error("No routine saved.");
  return definition;
}
export function saveRoutines(input: unknown): Promise<RoutineDefinition[]> {
  const parsed = saveRoutinesInputSchema.parse(input);
  const dir = directory();
  return serialized(dir, async () => {
    const records = await definitions(dir);
    const existing = records.filter((record) => record.requestId === parsed.requestId);
    if (existing.length) {
      if (
        existing.length !== parsed.routines.length ||
        existing.some((record, index) => {
          const requested = parsed.routines[index];
          if (!requested) return true;
          const { id, version, createdAt, ...draft } = record.definition;
          void createdAt;
          return (
            JSON.stringify(draft) !== JSON.stringify(requested.draft) ||
            (requested.routineId !== null
              ? id !== requested.routineId || version !== (requested.baseVersion ?? 0) + 1
              : version !== 1)
          );
        })
      )
        throw new Error("This request ID has already been used.");
      return existing.map((record) => record.definition);
    }
    const saved = parsed.routines.map((item) => {
      const history = records.filter((record) => record.definition.id === item.routineId);
      const previous = history.at(-1)?.definition;
      if (item.routineId !== null && (!previous || previous.version !== item.baseVersion))
        throw new Error("Routine changed. Reload before editing.");
      for (const record of history) {
        for (const step of item.draft.steps) {
          const oldStep = record.definition.steps.find((candidate) => candidate.id === step.id);
          for (const field of step.fields) {
            const oldField = oldStep?.fields.find((candidate) => candidate.id === field.id);
            if (oldField?.metric && oldField.metric.id !== field.metric?.id)
              throw new Error("Changing a field metric requires a new field ID.");
            if (oldField && (oldField.type !== field.type || oldField.unit !== field.unit))
              throw new Error("Changing a field type or unit requires a new field ID.");
          }
        }
      }
      return routineDefinitionSchema.parse({
        ...item.draft,
        id: item.routineId ?? randomUUID(),
        version: (previous?.version ?? 0) + 1,
        createdAt: new Date().toISOString(),
      });
    });
    metricCatalogue([...records.map((record) => record.definition), ...saved]);
    // One append makes the batch indivisible to readers and retryable by one request ID.
    await append(dir, "definitions.jsonl", {
      requestId: parsed.requestId,
      definitions: saved,
    });
    return saved;
  });
}
export function loadRoutineRuns(): Promise<RoutineRun[]> {
  const dir = directory();
  return serialized(dir, () => activeRuns(dir));
}
export function loadRoutineHistory(): Promise<
  Array<{ run: RoutineRun; definition: RoutineDefinition }>
> {
  const dir = directory();
  return serialized(dir, async () => {
    const records = await definitions(dir);
    return (await activeRuns(dir)).map((run) => {
      const definition = records.find(
        (record) =>
          record.definition.id === run.routineId &&
          record.definition.version === run.routineVersion,
      )?.definition;
      if (!definition) throw new Error("Recorded routine version does not exist.");
      return { run, definition };
    });
  });
}
export function recordRoutineRun(input: unknown): Promise<RoutineRun> {
  const parsed = routineRunInputSchema.parse(input);
  const dir = directory();
  return serialized(dir, async () => {
    const definition = (await definitions(dir)).find(
      (record) =>
        record.definition.id === parsed.routineId &&
        record.definition.version === parsed.routineVersion,
    )?.definition;
    if (!definition) throw new Error("Routine version does not exist.");
    validateRoutineRun(definition, parsed);
    const schedule = definition.schedules.find((schedule) => schedule.id === parsed.scheduleId);
    const firstSchedule = definition.schedules[0];
    if (!firstSchedule) throw new Error("Routine has no schedule.");
    const resolveDate = (input: typeof parsed) =>
      input.routineDate ??
      (schedule
        ? routineDateForSchedule(schedule, new Date(input.occurredAt))
        : routineDay(new Date(input.occurredAt), firstSchedule.timeZone));
    const normalized = routineRunInputSchema.parse({
      ...parsed,
      routineDate: resolveDate(parsed),
    });
    // Search raw records so retrying a canceled submission cannot resurrect it.
    const existing = (await runs(dir)).find((run) => run.id === parsed.id);
    if (existing) {
      const { recordedAt, ...storedInput } = existing;
      void recordedAt;
      const original = routineRunInputSchema.parse({
        ...storedInput,
        routineDate: resolveDate(existing),
      });
      if (JSON.stringify(original) !== JSON.stringify(normalized))
        throw new Error("This run ID has already been used.");
      return existing;
    }
    const record = { ...normalized, recordedAt: new Date().toISOString() };
    await append(dir, `${day.format(new Date(record.recordedAt))}.jsonl`, record);
    return record;
  });
}
