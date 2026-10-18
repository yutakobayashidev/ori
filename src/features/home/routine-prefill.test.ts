import { afterEach, expect, it, vi } from "vitest";
import type { RoutineField } from "../routines/routine-model";
import type { RoutineCandidate } from "./task-intent";
import { routinePrefillPlan } from "./routine-prefill";
import { evaluateTaskInput, interpretTaskInput } from "./task-intent.server";

const field: RoutineField = {
  id: "amount",
  label: "Weight",
  type: "number",
  required: true,
  unit: "kg",
  min: 0,
  max: 500,
  options: [],
};
const routine: RoutineCandidate = {
  id: "weight",
  name: "Weight",
  description: "",
  aliases: ["体重"],
  steps: [
    { id: "measurement", label: "Weight", layout: "stack", repeatable: false, fields: [field] },
  ],
  schedules: [],
};
const answer = (choice: string, confidence = 1) => ({
  type: "choice" as const,
  choice,
  confidence,
});
afterEach(() => vi.unstubAllGlobals());

it("copies decimal and full-width source numbers into dynamic fields", () => {
  const plan = routinePrefillPlan("体重６５．２", routine);
  expect(plan.read({ field_0_0: answer("v0") })).toEqual({
    routineValues: { measurement: { done: true, entries: [{ amount: 65.2 }] } },
  });
});
it("does not expose out-of-range candidates or accept invented choices", () => {
  const plan = routinePrefillPlan("体重 -2、65.2、9999", routine);
  expect(plan.questions.field_0_0?.criteria.v0).toContain("65.2");
  expect(plan.questions.field_0_0?.criteria.v1).toBeUndefined();
  expect(plan.read({ field_0_0: answer("v999") })).toEqual({});
  expect(plan.read({ field_0_0: answer("v0", 0.4) })).toEqual({});
});
it("maps paired values without hardcoding a health-specific schema", () => {
  const bp: RoutineCandidate = {
    ...routine,
    name: "Blood pressure",
    steps: [
      {
        id: "bp",
        label: "Blood pressure",
        layout: "inline",
        repeatable: true,
        fields: [
          { ...field, id: "upper", label: "Systolic", unit: "mmHg" },
          { ...field, id: "lower", label: "Diastolic", unit: "mmHg" },
        ],
      },
    ],
  };
  expect(
    routinePrefillPlan("血圧120/80", bp).read({ field_0_0: answer("v0"), field_0_1: answer("v1") }),
  ).toEqual({ routineValues: { bp: { done: true, entries: [{ upper: 120, lower: 80 }] } } });
});
it("preserves explicit false and zero instead of treating them as missing", () => {
  const custom = {
    ...routine,
    steps: [
      {
        id: "measurement",
        label: "Custom",
        layout: "stack" as const,
        repeatable: false,
        fields: [
          { ...field, id: "score" },
          {
            ...field,
            id: "rested",
            label: "Rested",
            type: "boolean" as const,
            unit: null,
            min: null,
            max: null,
          },
        ],
      },
    ],
  };
  expect(
    routinePrefillPlan("score 0, rested false", custom).read({
      field_0_0: answer("v0"),
      field_0_1: answer("no"),
    }),
  ).toEqual({
    routineValues: { measurement: { done: true, entries: [{ score: 0, rested: false }] } },
  });
});
it("selects saved options and literal text without generating arbitrary strings", () => {
  const custom: RoutineCandidate = {
    ...routine,
    steps: [
      {
        id: "custom",
        label: "Custom",
        layout: "stack",
        repeatable: false,
        fields: [
          {
            ...field,
            id: "choice",
            type: "choice",
            options: [{ value: "a", label: "Alpha" }],
            min: null,
            max: null,
            unit: null,
          },
          {
            ...field,
            id: "many",
            type: "multiChoice",
            options: [
              { value: "a", label: "Alpha" },
              { value: "b", label: "Beta" },
            ],
            min: null,
            max: null,
            unit: null,
          },
          { ...field, id: "note", type: "text", min: null, max: null, unit: null },
        ],
      },
    ],
  };
  expect(
    routinePrefillPlan("AlphaとBeta note: calm", custom).read({
      field_0_0: answer("o0"),
      field_0_1_0: answer("selected"),
      field_0_1_1: answer("selected"),
      field_0_2: answer("v0"),
    }),
  ).toEqual({
    routineValues: {
      custom: { done: true, entries: [{ choice: "a", many: ["a", "b"], note: "calm" }] },
    },
  });
});
it("only marks Done when an explicit completion was judged", () => {
  const done: RoutineCandidate = {
    ...routine,
    steps: [{ id: "brush", label: "Brush teeth", layout: "stack", repeatable: false, fields: [] }],
  };
  const plan = routinePrefillPlan("歯磨きした", done);
  expect(plan.read({ done_0: answer("done") })).toEqual({
    routineValues: { brush: { done: true, entries: [] } },
  });
  expect(plan.read({ done_0: answer("none") })).toEqual({});
});
it("copies only a selected saved schedule and bounds questions for large forms", () => {
  const scheduled: RoutineCandidate = {
    ...routine,
    schedules: [
      {
        id: "night",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        timeOfDay: "bedtime",
        time: null,
        timeZone: "Asia/Tokyo",
      },
    ],
  };
  expect(routinePrefillPlan("夜の体重65", scheduled).read({ schedule: answer("s0") })).toEqual({
    routineScheduleId: "night",
  });
  expect(routinePrefillPlan("体重65", scheduled).read({ schedule: answer("none") })).toEqual({});
  const large = {
    ...routine,
    steps: Array.from({ length: 100 }, (_, i) => ({
      id: `step${i}`,
      label: "Custom",
      repeatable: false,
      layout: "stack" as const,
      fields: [field],
    })),
  };
  expect(Object.keys(routinePrefillPlan("65", large).questions)).toHaveLength(32);
});
it("asks extraction questions only after matching a saved routine", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      Response.json({
        model: "jev",
        answers: { intent: answer("routine_run"), routine: answer("r0") },
      }),
    )
    .mockResolvedValueOnce(Response.json({ model: "jev", answers: { field_0_0: answer("v0") } }));
  vi.stubGlobal("fetch", fetch);
  const result = await interpretTaskInput(
    { text: "体重65.2", today: "2026-10-19" },
    { apiKey: "test", routines: [routine] },
  );
  expect(result).toMatchObject({
    status: "routine_run",
    routineId: "weight",
    routineValues: { measurement: { done: true, entries: [{ amount: 65.2 }] } },
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  const body = fetch.mock.calls[1]?.[1]?.body;
  expect(typeof body).toBe("string");
  const extraction = JSON.parse(body as string);
  expect(extraction.state.routine.id).toBe("weight");
  expect(extraction.questions.field_0_0.criteria.v0).toContain("65.2");
});
it.each(["journal", "none"])(
  "does not extract or invent completion for %s intent",
  async (intent) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ model: "jev", answers: { intent: answer(intent) } }));
    vi.stubGlobal("fetch", fetch);
    const result = await interpretTaskInput(
      { text: "体重のことを考えると憂鬱", today: "2026-10-19" },
      { apiKey: "test", routines: [routine] },
    );
    expect(result.status).toBe(intent);
    expect(result.routineValues).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it("accounts for both classification and extraction tokens", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      Response.json({
        model: "jev",
        answers: { intent: answer("routine_run"), routine: answer("r0") },
        usage: { input_tokens: 100, output_tokens: 10 },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        model: "jev",
        answers: { field_0_0: answer("v0") },
        usage: { input_tokens: 50, output_tokens: 5 },
      }),
    );
  vi.stubGlobal("fetch", fetch);
  const { diagnostics } = await evaluateTaskInput(
    { text: "体重65.2", today: "2026-10-19" },
    { apiKey: "test", routines: [routine] },
  );
  expect(diagnostics?.usage).toEqual({ input_tokens: 150, output_tokens: 15 });
});
