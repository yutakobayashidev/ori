import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { canSaveRoutine, type RoutineBuilderReply } from "./routine-builder";
import { buildRoutineReply } from "./routine-builder.server";
import { generateRoutineDraft } from "./routine-builder-provider.server";
import { listRoutineMetrics } from "./routine-repository.server";

vi.mock("./routine-repository.server", () => ({
  listRoutineMetrics: vi.fn<typeof listRoutineMetrics>(async () => []),
}));

vi.mock("./routine-builder-provider.server", () => ({
  generateRoutineDraft: vi.fn<typeof generateRoutineDraft>(),
}));
const generate = vi.mocked(generateRoutineDraft);
afterEach(() => vi.resetAllMocks());

function readyReply(): RoutineBuilderReply {
  return {
    message: "Ready to review.",
    questions: [],
    missingFields: [],
    drafts: [
      {
        name: "Bedtime",
        description: "",
        aliases: ["寝る前"],
        schedules: [
          {
            id: "bedtime",
            weekdays: [0, 1, 2, 3, 4, 5, 6],
            timeOfDay: "bedtime",
            time: null,
            timeZone: "Asia/Tokyo",
          },
        ],
        steps: [
          { id: "brush", label: "Brush teeth", repeatable: false, layout: "stack", fields: [] },
        ],
      },
    ],
  };
}

it("allows a complete done-only routine without an exact time or measurement fields", () => {
  expect(canSaveRoutine(readyReply())).toBe(true);
});

it.each([
  { name: "no reply", reply: null },
  { name: "no draft", reply: { ...readyReply(), drafts: [] } },
  { name: "unanswered question", reply: { ...readyReply(), questions: ["Which days?"] } },
  { name: "missing decision", reply: { ...readyReply(), missingFields: ["schedule"] } },
])("does not allow saving with $name", ({ reply }) => {
  expect(canSaveRoutine(reply)).toBe(false);
});

it("does not allow duplicate step IDs even if the AI claims all decisions are resolved", () => {
  const reply = readyReply();
  if (!reply.drafts[0]) throw new Error("Expected fixture draft.");
  reply.drafts[0].steps.push({
    id: "brush",
    label: "Take a bath",
    repeatable: false,
    layout: "stack",
    fields: [],
  });
  expect(canSaveRoutine(reply)).toBe(false);
});

it("passes the full conversation, current definition, and exact response schema to Codex", async () => {
  const reply = readyReply();
  const input = {
    messages: [
      { role: "user", text: "寝る前に歯を磨く" },
      { role: "assistant", text: "毎日ですか？" },
      { role: "user", text: "毎日" },
    ],
    currentDrafts: reply.drafts,
  };
  generate.mockResolvedValue(reply);
  await expect(buildRoutineReply(input)).resolves.toEqual(reply);
  expect(generate).toHaveBeenCalledExactlyOnceWith({
    ...input,
    outputSchema: expect.any(Object),
    instructions: expect.any(String),
  });
});

it("supplies existing shared metrics and requires explicit nullable metric bindings in AI output", async () => {
  const metric = { id: "body_weight", label: "Weight", group: "body_weight", unit: "kg" };
  vi.mocked(listRoutineMetrics).mockResolvedValue([metric]);
  generate.mockResolvedValue(readyReply());
  await buildRoutineReply({
    messages: [{ role: "user", text: "Track my weight daily" }],
    currentDrafts: [],
  });
  const args = generate.mock.calls[0]?.[0];
  expect(args?.instructions).toContain(JSON.stringify([metric]));
  const fieldSchemas: Array<Record<string, unknown>> = [];
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    const schema = value as Record<string, unknown>;
    if ((schema.properties as Record<string, unknown> | undefined)?.metric)
      fieldSchemas.push(schema);
    Object.values(schema).forEach(visit);
  }
  visit(args?.outputSchema);
  expect(fieldSchemas.length).toBeGreaterThan(0);
  for (const schema of fieldSchemas) expect(schema.required).toContain("metric");
});

it("returns necessary questions without requiring an initial draft", async () => {
  const reply = {
    message: "何をするルーティンですか？",
    questions: ["何をするルーティンですか？"],
    missingFields: ["steps"],
    drafts: [],
  };
  generate.mockResolvedValue(reply);
  await expect(
    buildRoutineReply({
      messages: [{ role: "user", text: "ルーティンを作りたい" }],
      currentDrafts: [],
    }),
  ).resolves.toEqual(reply);
});

it.each([
  { name: "missing fields", result: { message: "Ready" } },
  { name: "unknown properties", result: { ...readyReply(), executableCode: "run()" } },
  { name: "too many questions", result: { ...readyReply(), questions: ["1", "2", "3", "4"] } },
  {
    name: "invalid schedule",
    result: {
      ...readyReply(),
      drafts: [{ ...readyReply().drafts[0], schedules: [{ weekdays: [8] }] }],
    },
  },
])("rejects invalid Codex output: $name", async ({ result }) => {
  generate.mockResolvedValue(result);
  await expect(
    buildRoutineReply({
      messages: [{ role: "user", text: "Every night" }],
      currentDrafts: [],
    }),
  ).rejects.toThrow(z.ZodError);
});

it("requires a new user message before invoking Codex", async () => {
  await expect(
    buildRoutineReply({
      messages: [{ role: "assistant", text: "Which days?" }],
      currentDrafts: [],
    }),
  ).rejects.toThrow("A new message is required.");
  expect(generate).not.toHaveBeenCalled();
});

it("accepts legacy aggregate edit context but rejects newly generated aggregate routines", async () => {
  const reply = readyReply();
  const aggregate = {
    ...required(reply.drafts[0]),
    steps: [
      ...required(reply.drafts[0]).steps,
      { id: "bath", label: "Bath", repeatable: false, layout: "stack" as const, fields: [] },
    ],
  };
  generate.mockResolvedValue(reply);
  await expect(
    buildRoutineReply({
      messages: [{ role: "user", text: "別々のルーティンにして" }],
      currentDrafts: [aggregate],
    }),
  ).resolves.toEqual(reply);
  generate.mockResolvedValue({ ...reply, drafts: [aggregate] });
  await expect(
    buildRoutineReply({
      messages: [{ role: "user", text: "別々のルーティンにして" }],
      currentDrafts: [aggregate],
    }),
  ).rejects.toThrow(z.ZodError);
});

it("allows separate actions with multiple daily schedule slots and blocks the entire batch if one draft is invalid", () => {
  const reply = readyReply();
  const brush = required(reply.drafts[0]);
  brush.schedules.push({ ...required(brush.schedules[0]), id: "morning", timeOfDay: "morning" });
  reply.drafts.push({
    ...brush,
    name: "Bath",
    steps: [{ id: "bath", label: "Bath", repeatable: false, layout: "stack", fields: [] }],
  });
  expect(canSaveRoutine(reply)).toBe(true);
  required(reply.drafts[1]).schedules = [];
  expect(canSaveRoutine(reply)).toBe(false);
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing test fixture.");
  return value;
}

it("offers immediate recording without asking for unspecified dates or times", async () => {
  const reply = readyReply();
  required(reply.drafts[0]).schedules = [
    {
      id: "anytime",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      timeOfDay: "anytime",
      time: null,
      timeZone: "Asia/Tokyo",
    },
  ];
  generate.mockResolvedValue(reply);
  const result = await buildRoutineReply({
    messages: [{ role: "user", text: "歯磨きを記録したい" }],
    currentDrafts: [],
  });
  expect(canSaveRoutine(result)).toBe(true);
  expect(result.questions).toEqual([]);
  expect(result.missingFields).toEqual([]);
  expect(required(result.drafts[0]).schedules).toEqual([
    {
      id: "anytime",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      timeOfDay: "anytime",
      time: null,
      timeZone: "Asia/Tokyo",
    },
  ]);
  const instructions = generate.mock.calls[0]?.[0].instructions;
  expect(instructions).toContain(
    "Dates and scheduling are optional: prioritize immediate recording.",
  );
  expect(instructions).toContain(
    "Do not ask when, require a date, or include timing in missingFields.",
  );
});
