import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routineDraftSchema, type RoutineDraft } from "./routine-model";
import {
  listRoutines,
  listRoutineMetrics,
  loadRoutineHistory,
  loadRoutineRuns,
  recordRoutineRun,
  saveRoutine,
} from "./routine-repository.server";

const draft: RoutineDraft = {
  name: "Evening",
  description: "Personal routine",
  aliases: ["Night routine"],
  schedule: {
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: "bedtime",
    time: null,
    timeZone: "Asia/Tokyo",
  },
  steps: [
    { id: "brush", label: "Brush teeth", repeatable: false, layout: "stack", fields: [] },
    {
      id: "measure",
      label: "Measurement",
      repeatable: true,
      layout: "inline",
      fields: [
        {
          id: "value",
          label: "Value",
          type: "number",
          required: true,
          unit: "kg",
          options: [],
          min: 0,
          max: 1000,
        },
        {
          id: "context",
          label: "Context",
          type: "choice",
          required: false,
          unit: null,
          options: [{ value: "rest", label: "At rest" }],
          min: null,
          max: null,
        },
      ],
    },
  ],
};
function fixtureStep(value: RoutineDraft) {
  const step = value.steps[1];
  if (!step) throw new Error("Missing fixture step");
  return step;
}
function fixtureField(value: RoutineDraft, index = 0) {
  const field = fixtureStep(value).fields[index];
  if (!field) throw new Error("Missing fixture field");
  return field;
}
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ori-routines-"));
  vi.stubEnv("TWITTER_LITE_ROUTINE_DIR", dir);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-18T15:01:02Z"));
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});
const create = () =>
  saveRoutine({ requestId: randomUUID(), routineId: null, baseVersion: null, draft });
describe("routine persistence", () => {
  it("shares one metric across routines and rejects conflicting units, labels and groups", async () => {
    const mapped = structuredClone(draft);
    fixtureField(mapped, 0).metric = {
      id: "body_weight",
      label: "Weight",
      group: "body_weight",
    };
    await saveRoutine({
      requestId: randomUUID(),
      routineId: null,
      baseVersion: null,
      draft: mapped,
    });
    await saveRoutine({
      requestId: randomUUID(),
      routineId: null,
      baseVersion: null,
      draft: { ...mapped, name: "Morning" },
    });
    expect(await listRoutineMetrics()).toEqual([
      { id: "body_weight", label: "Weight", group: "body_weight", unit: "kg" },
    ]);
    for (const change of [
      { unit: "lb" },
      { metric: { id: "body_weight", label: "Other", group: "body_weight" } },
      { metric: { id: "body_weight", label: "Weight", group: "other" } },
    ]) {
      const conflict = structuredClone(mapped);
      Object.assign(fixtureField(conflict, 0), change);
      await expect(
        saveRoutine({
          requestId: randomUUID(),
          routineId: null,
          baseVersion: null,
          draft: conflict,
        }),
      ).rejects.toThrow("must keep its label, group and unit");
    }
  });
  it("binds an old field explicitly without rewriting history and requires a new ID to change its metric", async () => {
    const first = await create();
    const mapped = structuredClone(draft);
    fixtureField(mapped, 0).metric = {
      id: "body_weight",
      label: "Weight",
      group: "body_weight",
    };
    await saveRoutine({
      requestId: randomUUID(),
      routineId: first.id,
      baseVersion: 1,
      draft: mapped,
    });
    const records = (await readFile(join(dir, "definitions.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records[0].definition.steps[1].fields[0].metric).toBeUndefined();
    for (const metric of [null, { id: "other", label: "Other", group: "other" }]) {
      const changed = structuredClone(mapped);
      fixtureField(changed, 0).metric = metric;
      await expect(
        saveRoutine({
          requestId: randomUUID(),
          routineId: first.id,
          baseVersion: 2,
          draft: changed,
        }),
      ).rejects.toThrow("new field ID");
    }
  });
  it("rejects nonnumeric metric bindings and inconsistent bindings within one definition", async () => {
    const invalid = structuredClone(draft);
    fixtureField(invalid, 1).metric = { id: "context", label: "Context", group: "context" };
    expect(routineDraftSchema.safeParse(invalid).success).toBe(false);
    const mapped = structuredClone(draft);
    const field = fixtureField(mapped, 0);
    field.metric = { id: "body_weight", label: "Weight", group: "body_weight" };
    mapped.steps.push({
      ...fixtureStep(mapped),
      id: "second",
      fields: [{ ...field, id: "different", unit: "lb" }],
    });
    await expect(
      saveRoutine({ requestId: randomUUID(), routineId: null, baseVersion: null, draft: mapped }),
    ).rejects.toThrow("must keep");
    mapped.steps.pop();
    fixtureStep(mapped).fields.push({ ...field, id: "duplicate" });
    expect(routineDraftSchema.safeParse(mapped).success).toBe(false);
  });
  it("requires new field IDs when types or units change, including reintroduced fields", async () => {
    const first = await create();
    const changed = structuredClone(draft);
    const field = changed.steps[1]?.fields[0];
    if (!field) throw new Error("Missing fixture field");
    field.unit = "lb";
    await expect(
      saveRoutine({ requestId: randomUUID(), routineId: first.id, baseVersion: 1, draft: changed }),
    ).rejects.toThrow("new field ID");
    const removed = await saveRoutine({
      requestId: randomUUID(),
      routineId: first.id,
      baseVersion: 1,
      draft: { ...draft, steps: draft.steps.slice(0, 1) },
    });
    await expect(
      saveRoutine({
        requestId: randomUUID(),
        routineId: first.id,
        baseVersion: removed.version,
        draft: changed,
      }),
    ).rejects.toThrow("new field ID");
    field.id = "value_lb";
    expect(
      (
        await saveRoutine({
          requestId: randomUUID(),
          routineId: first.id,
          baseVersion: removed.version,
          draft: changed,
        })
      ).version,
    ).toBe(3);
  });
  it("rejects empty observations but preserves false and zero as recorded values", async () => {
    const definition = await create();
    const input = {
      id: randomUUID(),
      routineId: definition.id,
      routineVersion: 1,
      occurredAt: "2026-10-18T14:00:00Z",
      steps: [
        { stepId: "brush", done: false, entries: [] },
        { stepId: "measure", done: false, entries: [] },
      ],
    };
    await expect(recordRoutineRun(input)).rejects.toThrow("completed step or a value");
    const recorded = await recordRoutineRun({
      ...input,
      steps: [input.steps[0], { stepId: "measure", done: false, entries: [{ value: 0 }] }],
    });
    expect(recorded.steps[1]?.entries[0]?.value).toBe(0);
    expect(recorded.steps[0]?.done).toBe(false);
  });
  it("preserves an explicit measurement time independently from the routine recording time", async () => {
    const definition = await create();
    const measurementTime = "2026-10-18T08:00:00+09:00";
    const run = await recordRoutineRun({
      id: randomUUID(),
      routineId: definition.id,
      routineVersion: 1,
      occurredAt: "2026-10-18T14:00:00Z",
      steps: [
        { stepId: "brush", done: false, entries: [] },
        { stepId: "measure", done: true, occurredAt: measurementTime, entries: [{ value: 65 }] },
      ],
    });
    expect(run.steps[1]?.occurredAt).toBe(measurementTime);
    expect((await loadRoutineRuns())[0]?.steps[1]?.occurredAt).toBe(measurementTime);
    expect(run.occurredAt).toBe("2026-10-18T14:00:00Z");
    for (const occurredAt of ["yesterday", "2026-10-18T08:00:00", "2026-02-30T08:00:00Z"]) {
      expect(() =>
        recordRoutineRun({
          id: randomUUID(),
          routineId: run.routineId,
          routineVersion: run.routineVersion,
          occurredAt: run.occurredAt,
          steps: run.steps.map((step) => ({ ...step, occurredAt })),
        }),
      ).toThrow("Invalid ISO datetime");
    }
  });
  it("keeps immutable versions and rejects stale edits", async () => {
    const first = await create();
    const before = await readFile(join(dir, "definitions.jsonl"), "utf8");
    const second = await saveRoutine({
      requestId: randomUUID(),
      routineId: first.id,
      baseVersion: 1,
      draft: { ...draft, name: "Updated" },
    });
    expect(second.version).toBe(2);
    expect(await listRoutines()).toEqual([second]);
    expect((await readFile(join(dir, "definitions.jsonl"), "utf8")).startsWith(before)).toBe(true);
    await expect(
      saveRoutine({ requestId: randomUUID(), routineId: first.id, baseVersion: 1, draft }),
    ).rejects.toThrow("changed");
    expect((await stat(join(dir, "definitions.jsonl"))).mode & 0o777).toBe(0o600);
  });
  it("deduplicates concurrent retries and rejects ID reuse", async () => {
    const input = { requestId: randomUUID(), routineId: null, baseVersion: null, draft };
    const [a, b] = await Promise.all([saveRoutine(input), saveRoutine(input)]);
    expect(a).toEqual(b);
    expect(await listRoutines()).toHaveLength(1);
    await expect(saveRoutine({ ...input, draft: { ...draft, name: "Other" } })).rejects.toThrow(
      "already been used",
    );
  });
  it("appends repeated measurements, preserving old definition versions and authoritative timestamps", async () => {
    const routine = await create();
    await saveRoutine({
      requestId: randomUUID(),
      routineId: routine.id,
      baseVersion: 1,
      draft: { ...draft, steps: draft.steps.slice(0, 1) },
    });
    const input = {
      id: randomUUID(),
      routineId: routine.id,
      routineVersion: 1,
      occurredAt: "2026-10-18T14:00:00Z",
      steps: [
        { stepId: "brush", done: true, entries: [] },
        {
          stepId: "measure",
          done: true,
          entries: [{ value: 65.2, context: "rest" }, { value: 65.1 }],
        },
      ],
    };
    const run = await recordRoutineRun(input);
    expect(run.recordedAt).toBe("2026-10-18T15:01:02.000Z");
    const path = join(dir, "2026-10-19.jsonl");
    const original = await readFile(path, "utf8");
    vi.setSystemTime(new Date("2026-10-18T15:05:00Z"));
    expect(await recordRoutineRun(input)).toEqual(run);
    expect(await readFile(path, "utf8")).toBe(original);
    await recordRoutineRun({ ...input, id: randomUUID() });
    expect((await readFile(path, "utf8")).startsWith(original)).toBe(true);
    expect(await loadRoutineRuns()).toHaveLength(2);
    const history = await loadRoutineHistory();
    expect(history[0]?.definition.version).toBe(1);
    expect(history[0]?.definition.steps[1]?.fields[0]?.unit).toBe("kg");
    expect(history[0]?.run.routineVersion).toBe(history[0]?.definition.version);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await expect(
      recordRoutineRun({ ...input, occurredAt: "2026-10-18T14:01:00Z" }),
    ).rejects.toThrow("already been used");
  });
  it("validates required values, types, unknown fields, duplicate steps and repetition", async () => {
    const routine = await create();
    const input = {
      id: randomUUID(),
      routineId: routine.id,
      routineVersion: 1,
      occurredAt: "2026-10-18T14:00:00Z",
      steps: [
        { stepId: "brush", done: true, entries: [] },
        { stepId: "measure", done: true, entries: [{}] },
      ],
    };
    await expect(recordRoutineRun(input)).rejects.toThrow("required");
    for (const entry of [
      { value: "65" },
      { value: -1 },
      { value: 65, context: "unknown" },
      { value: 65, extra: true },
    ]) {
      await expect(
        recordRoutineRun({
          ...input,
          steps: [input.steps[0], { ...input.steps[1], entries: [entry] }],
        }),
      ).rejects.toThrow(/Invalid|Unknown/);
    }
    await expect(
      recordRoutineRun({ ...input, steps: [input.steps[0], input.steps[0]] }),
    ).rejects.toThrow("exactly once");
    await expect(
      recordRoutineRun({
        ...input,
        steps: [
          { ...input.steps[0], entries: [{}] },
          { ...input.steps[1], done: false, entries: [] },
        ],
      }),
    ).rejects.toThrow("Done-only");
    expect(await loadRoutineRuns()).toEqual([]);
  });
  it("rejects malformed storage before appending", async () => {
    await writeFile(join(dir, "definitions.jsonl"), '{"incomplete":');
    await expect(create()).rejects.toThrow("Incomplete");
    expect(await readFile(join(dir, "definitions.jsonl"), "utf8")).toBe('{"incomplete":');
  });
  it("rejects ambiguous definitions", () => {
    expect(
      routineDraftSchema.safeParse({ ...draft, steps: [draft.steps[0], draft.steps[0]] }).success,
    ).toBe(false);
    expect(
      routineDraftSchema.safeParse({ ...draft, schedule: { ...draft.schedule, time: "25:00" } })
        .success,
    ).toBe(false);
    expect(
      routineDraftSchema.safeParse({ ...draft, schedule: { ...draft.schedule, weekdays: [1, 1] } })
        .success,
    ).toBe(false);
    expect(
      routineDraftSchema.safeParse({
        ...draft,
        schedule: { ...draft.schedule, timeZone: "not/a/zone" },
      }).success,
    ).toBe(false);
  });
});
