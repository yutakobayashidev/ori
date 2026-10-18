import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  routineDefinitionSchema,
  routineRunInputSchema,
  routineRunSchema,
  saveRoutineInputSchema,
  validateRoutineRun,
  type RoutineDefinition,
  type RoutineMetric,
  type RoutineRun,
} from "./routine-model";

const definitionRecord = z.strictObject({
  requestId: z.uuid(),
  definition: routineDefinitionSchema,
});
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
function definitions(dir: string) {
  return readLines(join(dir, "definitions.jsonl"), definitionRecord);
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
export function saveRoutine(input: unknown): Promise<RoutineDefinition> {
  const parsed = saveRoutineInputSchema.parse(input);
  const dir = directory();
  return serialized(dir, async () => {
    const records = await definitions(dir);
    const existing = records.find((record) => record.requestId === parsed.requestId);
    if (existing) {
      const { id, version, createdAt, ...draft } = existing.definition;
      void createdAt;
      if (
        JSON.stringify(draft) !== JSON.stringify(parsed.draft) ||
        (parsed.routineId !== null &&
          (id !== parsed.routineId || version !== (parsed.baseVersion ?? 0) + 1)) ||
        (parsed.routineId === null && version !== 1)
      )
        throw new Error("This request ID has already been used.");
      return existing.definition;
    }
    const previous = records
      .filter((record) => record.definition.id === parsed.routineId)
      .at(-1)?.definition;
    if (parsed.routineId !== null && (!previous || previous.version !== parsed.baseVersion))
      throw new Error("Routine changed. Reload before editing.");
    for (const record of records.filter((record) => record.definition.id === parsed.routineId)) {
      for (const step of parsed.draft.steps) {
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
    const definition = routineDefinitionSchema.parse({
      ...parsed.draft,
      id: parsed.routineId ?? randomUUID(),
      version: (previous?.version ?? 0) + 1,
      createdAt: new Date().toISOString(),
    });
    metricCatalogue([...records.map((record) => record.definition), definition]);
    await append(dir, "definitions.jsonl", { requestId: parsed.requestId, definition });
    return definition;
  });
}
export function loadRoutineRuns(): Promise<RoutineRun[]> {
  const dir = directory();
  return serialized(dir, () => runs(dir));
}
export function loadRoutineHistory(): Promise<
  Array<{ run: RoutineRun; definition: RoutineDefinition }>
> {
  const dir = directory();
  return serialized(dir, async () => {
    const records = await definitions(dir);
    return (await runs(dir)).map((run) => {
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
    const existing = (await runs(dir)).find((run) => run.id === parsed.id);
    if (existing) {
      const { recordedAt, ...original } = existing;
      void recordedAt;
      if (JSON.stringify(original) !== JSON.stringify(parsed))
        throw new Error("This run ID has already been used.");
      return existing;
    }
    const definition = (await definitions(dir)).find(
      (record) =>
        record.definition.id === parsed.routineId &&
        record.definition.version === parsed.routineVersion,
    )?.definition;
    if (!definition) throw new Error("Routine version does not exist.");
    validateRoutineRun(definition, parsed);
    const record = { ...parsed, recordedAt: new Date().toISOString() };
    await append(dir, `${day.format(new Date(record.recordedAt))}.jsonl`, record);
    return record;
  });
}
